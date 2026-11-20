#!/usr/bin/env node

import * as p from '@clack/prompts';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const managedManifestName = '.agent-skills-managed.json';

export function resolveOwnSource(root = packageRoot) {
  return existsSync(join(root, '.git')) ? root : 'adstastic/skills';
}

const commonAgents = [
  ['claude-code', 'Claude Code'],
  ['codex', 'Codex'],
  ['pi', 'Pi'],
  ['cursor', 'Cursor'],
  ['opencode', 'OpenCode'],
  ['gemini-cli', 'Gemini CLI'],
  ['github-copilot', 'GitHub Copilot'],
  ['windsurf', 'Windsurf'],
];

export const sources = [
  {
    id: 'adstastic/skills',
    label: "Adi's Agent Skills",
    source: resolveOwnSource(),
    defaults: '*',
  },
  {
    id: 'vercel-labs/agent-browser',
    label: 'Vercel Labs',
    source: 'vercel-labs/agent-browser',
    defaults: ['agent-browser'],
  },
  {
    id: 'cursor/plugins/thermos',
    label: 'Cursor Thermos',
    source: 'https://github.com/cursor/plugins/tree/main/thermos',
    defaults: ['thermo-nuclear-review'],
  },
  {
    id: 'mattpocock/skills',
    label: 'Matt Pocock',
    source: 'mattpocock/skills',
    defaults: ['codebase-design', 'diagnosing-bugs'],
  },
  {
    id: 'cloudflare/skills',
    label: 'Cloudflare',
    source: 'cloudflare/skills',
    defaults: ['cloudflare', 'wrangler', 'workers-best-practices', 'durable-objects', 'agents-sdk'],
  },
  {
    id: 'danshapiro/trycycle',
    label: 'trycycle',
    source: 'danshapiro/trycycle',
    defaults: ['trycycle'],
  },
  {
    id: 'cursor/plugins/pstack',
    label: 'pstack',
    source: 'https://github.com/cursor/plugins/tree/main/pstack',
    defaults: '*',
  },
];

export const retiredSourceIds = [
  'herdrdev/herdr',
  'agavra/tuicr',
  'leopiney/linus-torvalds-skills',
];

function lockRepoId(id) {
  const parts = id.split('/');
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : id;
}

const managedLockRepos = new Set([
  ...sources.map((source) => lockRepoId(source.id)),
  ...retiredSourceIds.map(lockRepoId),
]);

function isManagedLockEntry(entry, ownRoot) {
  if (!entry || typeof entry.source !== 'string') return false;
  if (managedLockRepos.has(entry.source)) return true;
  if (entry.sourceType === 'local') {
    return entry.source === ownRoot || /(^|[\\/])agent-skills$/.test(entry.source);
  }
  return false;
}

export function parseArgs(argv) {
  const options = { agents: [], copy: false, global: undefined, help: false, prune: false, yes: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--yes' || arg === '-y') options.yes = true;
    else if (arg === '--global' || arg === '-g') options.global = true;
    else if (arg === '--project' || arg === '-p') options.global = false;
    else if (arg === '--copy') options.copy = true;
    else if (arg === '--prune') options.prune = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--agent' || arg === '-a') {
      const agent = argv[index + 1];
      if (!agent || agent.startsWith('-')) throw new Error(`${arg} requires an agent ID`);
      options.agents.push(agent);
      index += 1;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

export function parseSkillList(output, label = 'source') {
  const text = stripVTControlCharacters(output).replace(/\r/g, '');
  const expected = Number(text.match(/Found (\d+) skills?/)?.[1]);
  const names = [...text.matchAll(/^│ {4}(\S.*?)\s*$/gm)].map((match) => match[1]);
  if (!Number.isInteger(expected) || expected < 1 || new Set(names).size !== expected) {
    throw new Error(`Could not safely read ${label} skill list (expected ${expected}, parsed ${names.length})`);
  }
  return names;
}

export function npxEnv(env = process.env) {
  const clean = { ...env };
  delete clean.npm_config_package;
  return clean;
}

function captureCommand(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(npxCommand, args, {
      env: npxEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

export async function loadLiveSources(capture = captureCommand) {
  return Promise.all(
    sources.map(async (source) => {
      const result = await capture(['-y', 'skills', 'add', source.source, '--list']);
      if (result.code !== 0) throw new Error(`${source.label} catalog failed: ${result.stderr.trim()}`);
      const names = parseSkillList(result.stdout, source.label);
      const defaults = source.defaults === '*' ? new Set(names) : new Set(source.defaults);
      return {
        ...source,
        skills: names.map((name) => ({ name, default: defaults.has(name) })),
        missingDefaults:
          source.defaults === '*' ? [] : source.defaults.filter((name) => !names.includes(name)),
      };
    })
  );
}

export function selectDefaults(catalogs) {
  return catalogs
    .map((source) => ({ ...source, skills: source.skills.filter((skill) => skill.default) }))
    .filter((source) => source.skills.length > 0);
}

function cancelIfNeeded(value) {
  if (!p.isCancel(value)) return false;
  p.cancel('Installation cancelled');
  return true;
}

function skillSources(catalogs) {
  const providers = new Map();
  for (const source of catalogs) {
    for (const skill of source.skills) {
      providers.set(skill.name, [...(providers.get(skill.name) ?? []), source]);
    }
  }
  return providers;
}

export async function resolveDuplicates(catalogs, interactive = true) {
  for (const [name, providers] of skillSources(catalogs)) {
    if (providers.length < 2) continue;
    if (!interactive) {
      throw new Error(
        `Duplicate skill ${name} from ${providers.map((source) => source.id).join(', ')}`
      );
    }
    const selectedSource = await p.select({
      message: `Choose one source for duplicate skill ${name}`,
      options: providers.map((source) => ({
        value: source.source,
        label: source.label,
        hint: source.source,
      })),
    });
    if (cancelIfNeeded(selectedSource)) return null;
    for (const source of catalogs) {
      if (source.source !== selectedSource) {
        source.skills = source.skills.filter((skill) => skill.name !== name);
      }
    }
  }
  return catalogs.filter((source) => source.skills.length > 0);
}

async function chooseSkills(catalogs) {
  const preset = await p.select({
    message: 'Installation preset',
    initialValue: 'recommended',
    options: [
      { value: 'recommended', label: 'Recommended bundle', hint: 'Install curated defaults' },
      { value: 'custom', label: 'Customize', hint: 'Search every current upstream skill' },
    ],
  });
  if (cancelIfNeeded(preset)) return null;
  if (preset === 'recommended') return resolveDuplicates(selectDefaults(catalogs));

  const providers = skillSources(catalogs);
  const selected = [];
  for (const source of catalogs) {
    const names = await p.autocompleteMultiselect({
      message: `Skills from ${source.label}`,
      options: source.skills.map((skill) => {
        const otherOwners = providers
          .get(skill.name)
          .filter((provider) => provider.id !== source.id)
          .map((provider) => provider.label);
        const hints = [
          skill.default ? 'recommended' : null,
          otherOwners.length > 0 ? `also provided by ${otherOwners.join(', ')}` : null,
        ].filter(Boolean);
        return { value: skill.name, label: skill.name, hint: hints.join('; ') || undefined };
      }),
      initialValues: source.skills.filter((skill) => skill.default).map((skill) => skill.name),
      maxItems: 10,
      placeholder: 'Type to filter',
    });
    if (cancelIfNeeded(names)) return null;
    if (names.length > 0) {
      selected.push({ ...source, skills: source.skills.filter((skill) => names.includes(skill.name)) });
    }
  }
  if (selected.length === 0) {
    p.cancel('No skills selected');
    return null;
  }
  return resolveDuplicates(selected);
}

async function chooseInstallOptions() {
  const global = await p.select({
    message: 'Installation scope',
    initialValue: false,
    options: [
      { value: false, label: 'Project', hint: 'Available in current project' },
      { value: true, label: 'Global', hint: 'Available across all projects' },
    ],
  });
  if (cancelIfNeeded(global)) return null;

  const selectedAgents = await p.multiselect({
    message: 'Coding agents',
    options: [
      ...commonAgents.map(([value, label]) => ({ value, label })),
      { value: 'other', label: 'Other', hint: 'Enter Skills CLI agent IDs' },
    ],
    initialValues: ['claude-code', 'codex', 'pi'],
    required: true,
  });
  if (cancelIfNeeded(selectedAgents)) return null;

  const agents = selectedAgents.filter((agent) => agent !== 'other');
  if (selectedAgents.includes('other')) {
    const other = await p.text({
      message: 'Other agent IDs, comma-separated',
      placeholder: 'zed, qwen-code',
      validate(value) {
        const ids = value.split(',').map((id) => id.trim()).filter(Boolean);
        return ids.length > 0 && ids.every((id) => /^[a-z0-9-]+$/.test(id))
          ? undefined
          : 'Use comma-separated Skills CLI agent IDs';
      },
    });
    if (cancelIfNeeded(other)) return null;
    agents.push(...other.split(',').map((agent) => agent.trim()).filter(Boolean));
  }

  const mode = await p.select({
    message: 'Installation method',
    initialValue: 'symlink',
    options: [
      { value: 'symlink', label: 'Symlink', hint: 'Recommended; one canonical copy' },
      { value: 'copy', label: 'Copy', hint: 'Independent copy for each agent' },
    ],
  });
  if (cancelIfNeeded(mode)) return null;
  return { agents: [...new Set(agents)], copy: mode === 'copy', global };
}

export function buildCommands(selected, options) {
  return selected.map((source) => {
    const args = ['-y', 'skills', 'add', source.source];
    for (const skill of source.skills) args.push('--skill', skill.name);
    for (const agent of options.agents) args.push('--agent', agent);
    if (options.global) args.push('--global');
    if (options.copy) args.push('--copy');
    args.push('--yes');
    return { label: source.label, args };
  });
}

export function findStaleSkills(agentsDir, selectedNames, { ownRoot = packageRoot } = {}) {
  const keep = new Set(selectedNames);
  const skillsDir = join(agentsDir, 'skills');
  const stale = new Set();

  const lockFile = join(agentsDir, '.skill-lock.json');
  let lockSkills = {};
  if (existsSync(lockFile)) {
    const parsed = JSON.parse(readFileSync(lockFile, 'utf8'));
    if (parsed && typeof parsed.skills === 'object' && parsed.skills !== null) {
      lockSkills = parsed.skills;
    }
  }

  for (const [name, entry] of Object.entries(lockSkills)) {
    if (!keep.has(name) && isManagedLockEntry(entry, ownRoot)) {
      stale.add(name);
    }
  }

  const manifestFile = join(agentsDir, managedManifestName);
  if (existsSync(manifestFile)) {
    const parsed = JSON.parse(readFileSync(manifestFile, 'utf8'));
    const previous = Array.isArray(parsed?.skills) ? parsed.skills : [];
    for (const name of previous) {
      if (!keep.has(name) && (existsSync(join(skillsDir, name)) || Object.hasOwn(lockSkills, name))) {
        stale.add(name);
      }
    }
  }

  return [...stale].sort();
}

export function buildRemoveCommand(staleNames, options) {
  const args = ['-y', 'skills', 'remove', ...staleNames];
  if (options.global) args.push('--global');
  args.push('--yes');
  return { label: `Prune ${staleNames.length} removed skill${staleNames.length === 1 ? '' : 's'}`, args };
}

function runCommand(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(npxCommand, command.args, { env: npxEnv(), stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
}

export async function executeCommands(commands, run = runCommand) {
  for (const command of commands) {
    p.log.step(command.label.startsWith('Prune ') ? command.label : `Installing ${command.label}`);
    const exitCode = await run(command);
    if (exitCode !== 0) throw new Error(`${command.label} failed (${exitCode})`);
  }
}

// Codex ignores `disable-model-invocation`; only agents/openai.yaml hides a skill from its model.
export function markCodexManualOnly(skillsDir, names, warn = (message) => p.log.warn(message)) {
  const written = [];
  for (const name of names) {
    const skillFile = join(skillsDir, name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    const frontmatter = readFileSync(skillFile, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
    if (!/^disable-model-invocation:\s*true\s*$/m.test(frontmatter)) continue;
    const policyFile = join(skillsDir, name, 'agents', 'openai.yaml');
    if (!existsSync(policyFile)) {
      mkdirSync(dirname(policyFile), { recursive: true });
      writeFileSync(policyFile, 'policy:\n  allow_implicit_invocation: false\n');
      written.push(name);
    } else if (!/^\s*allow_implicit_invocation\s*:/m.test(readFileSync(policyFile, 'utf8'))) {
      warn(`${name} is manual-only, but its agents/openai.yaml has no allow_implicit_invocation, so Codex can start it`);
    }
  }
  return written;
}

export async function installBundle(
  selected,
  options,
  { run = runCommand, home = homedir(), cwd = process.cwd(), ownRoot = packageRoot } = {}
) {
  await executeCommands(buildCommands(selected, options), run);
  const names = selected.flatMap((source) => source.skills.map((skill) => skill.name));
  const agentsDir = join(options.global ? home : cwd, '.agents');
  if (options.prune) {
    const stale = findStaleSkills(agentsDir, names, { ownRoot });
    if (stale.length > 0) {
      await executeCommands([buildRemoveCommand(stale, options)], run);
    }
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, managedManifestName),
      `${JSON.stringify({ version: 1, skills: [...new Set(names)].sort() }, null, 2)}\n`
    );
  }
  return markCodexManualOnly(join(agentsDir, 'skills'), names);
}

function formatPlan(selected, options) {
  return [
    ...selected.map(
      (source) => `${source.label} (${source.source})\n  ${source.skills.map((skill) => skill.name).join(', ')}`
    ),
    '',
    `Scope: ${options.global ? 'global' : 'project'}`,
    `Agents: ${options.agents.join(', ') || 'auto-detect'}`,
    `Method: ${options.copy ? 'copy' : 'symlink'}`,
    ...(options.prune ? ['Prune: remove managed skills no longer in selection'] : []),
  ].join('\n');
}

function printHelp() {
  console.log(`Usage: agent-skills [options]\n\nOptions:\n  -y, --yes           Install curated defaults without prompts\n  -g, --global        Install globally\n  -p, --project       Install in current project\n  -a, --agent <id>    Target agent; repeatable\n      --copy           Copy instead of symlink\n      --prune          Remove managed skills no longer in selection\n  -h, --help           Show help`);
}

function warnRemovedDefaults(catalogs) {
  for (const source of catalogs) {
    if (source.missingDefaults.length > 0) {
      p.log.warn(`${source.label} removed defaults: ${source.missingDefaults.join(', ')}`);
    }
  }
}

export async function selectNoninteractive(capture) {
  const catalogs = await loadLiveSources(capture);
  warnRemovedDefaults(catalogs);
  return resolveDuplicates(selectDefaults(catalogs), false);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) return printHelp();

  let selected;
  let options;
  if (args.yes) {
    selected = await selectNoninteractive();
    options = { agents: args.agents, copy: args.copy, global: args.global ?? false, prune: args.prune };
  } else {
    p.intro('Agent Skills installer');
    const spinner = p.spinner();
    spinner.start('Loading current skill catalogs');
    const catalogs = await loadLiveSources();
    spinner.stop(`Loaded ${catalogs.reduce((total, source) => total + source.skills.length, 0)} current skills`);
    warnRemovedDefaults(catalogs);
    selected = await chooseSkills(catalogs);
    if (!selected) return;
    options = await chooseInstallOptions();
    if (!options) return;
    options = { ...options, prune: args.prune };
    p.note(formatPlan(selected, options), 'Review third-party sources before installing');
    const confirmed = await p.confirm({ message: 'Install this bundle?', initialValue: true });
    if (cancelIfNeeded(confirmed) || !confirmed) {
      if (confirmed === false) p.cancel('Installation cancelled');
      return;
    }
  }

  await installBundle(selected, options);
  p.outro('Agent skills installed');
}

let invokedPath = '';
try {
  invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : '';
} catch {}
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    p.cancel(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
