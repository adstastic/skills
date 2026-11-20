import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildCommands,
  buildRemoveCommand,
  executeCommands,
  findStaleSkills,
  installBundle,
  loadLiveSources,
  markCodexManualOnly,
  npxEnv,
  parseArgs,
  parseSkillList,
  resolveOwnSource,
  selectNoninteractive,
  sources,
} from '../bin/install.mjs';

test('package name and bin leave `npx skills` to the Skills CLI', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.notEqual(pkg.name, 'skills');
  assert.equal(Object.hasOwn(pkg.bin, 'skills'), false);
});

const listed = (names) =>
  `◇  Found ${names.length} skill${names.length === 1 ? '' : 's'}\n${names
    .map((name) => `│\n│    ${name}\n│\n│      Description for ${name}`)
    .join('\n')}\n`;

test('uses portable GitHub source outside a development checkout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-skills-source-'));
  try {
    assert.equal(resolveOwnSource(root), 'adstastic/skills');
    await writeFile(join(root, '.git'), 'gitdir: test');
    assert.equal(resolveOwnSource(root), root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('nested npx does not inherit the outer package selection', () => {
  assert.deepEqual(
    npxEnv({ PATH: '/bin', npm_config_package: '/outer/package' }),
    { PATH: '/bin' }
  );
});

test('parses shared installer options', () => {
  assert.deepEqual(
    parseArgs(['--yes', '--global', '--prune', '--agent', 'pi', '-a', 'codex', '--copy']),
    {
      agents: ['pi', 'codex'],
      copy: true,
      global: true,
      help: false,
      prune: true,
      yes: true,
    }
  );
  assert.throws(() => parseArgs(['--agent']), /requires an agent ID/);
});

test('reads a checked skill list from upstream output', () => {
  assert.deepEqual(parseSkillList(listed(['one', 'two']), 'Test'), ['one', 'two']);
  assert.throws(
    () => parseSkillList('◇  Found 2 skills\n│\n│    one\n', 'Test'),
    /expected 2, parsed 1/
  );
});

test('loads every current source catalog through Skills CLI list mode', async () => {
  const calls = [];
  const catalogs = await loadLiveSources(async (args) => {
    calls.push(args);
    return { code: 0, stdout: listed(['current-skill']), stderr: '' };
  });

  assert.equal(catalogs.length, sources.length);
  assert.equal(catalogs.every((source) => source.skills[0].name === 'current-skill'), true);
  assert.equal(calls.every((args) => args.at(-1) === '--list'), true);
});

const captureWith = (pstackNames) => async ([, , , url]) => {
  const source = sources.find((candidate) => candidate.source === url);
  const names =
    source.id === 'cursor/plugins/pstack'
      ? pstackNames
      : source.defaults === '*'
        ? ['local-skill']
        : [...source.defaults, 'uncurated'];
  return { code: 0, stdout: listed(names), stderr: '' };
};
const skillNames = (selected, id) =>
  selected.find((source) => source.id === id).skills.map((skill) => skill.name);

test('noninteractive mode keeps only curated default names', async () => {
  const selected = await selectNoninteractive(captureWith(['poteto-mode', 'tdd', 'teach']));
  assert.deepEqual(skillNames(selected, 'adstastic/skills'), ['local-skill']);
  assert.deepEqual(skillNames(selected, 'vercel-labs/agent-browser'), ['agent-browser']);
  assert.deepEqual(skillNames(selected, 'cursor/plugins/thermos'), ['thermo-nuclear-review']);
  assert.deepEqual(skillNames(selected, 'mattpocock/skills'), ['codebase-design', 'diagnosing-bugs']);
  assert.deepEqual(skillNames(selected, 'cloudflare/skills'), [
    'cloudflare',
    'wrangler',
    'workers-best-practices',
    'durable-objects',
    'agents-sdk',
  ]);
  assert.deepEqual(skillNames(selected, 'danshapiro/trycycle'), ['trycycle']);
  assert.deepEqual(skillNames(selected, 'cursor/plugins/pstack'), ['poteto-mode', 'tdd', 'teach']);
});

test('noninteractive mode rejects a duplicate skill across sources', async () => {
  await assert.rejects(
    selectNoninteractive(captureWith(['poteto-mode', 'agent-browser'])),
    /Duplicate skill agent-browser from vercel-labs\/agent-browser, cursor\/plugins\/pstack/
  );
});

test('builds one noninteractive install per source with shared choices', () => {
  const commands = buildCommands(
    [{ label: 'Test', source: 'owner/repo', skills: [{ name: 'one' }, { name: 'two' }] }],
    { agents: ['pi', 'codex'], copy: true, global: true }
  );
  assert.deepEqual(commands[0].args, [
    '-y',
    'skills',
    'add',
    'owner/repo',
    '--skill',
    'one',
    '--skill',
    'two',
    '--agent',
    'pi',
    '--agent',
    'codex',
    '--global',
    '--copy',
    '--yes',
  ]);
});

test('builds a prune command for removed skills', () => {
  const command = buildRemoveCommand(['herdr', 'tuicr'], { global: true });
  assert.equal(command.label, 'Prune 2 removed skills');
  assert.deepEqual(command.args, ['-y', 'skills', 'remove', 'herdr', 'tuicr', '--global', '--yes']);
});

test('finds stale managed and retired skills while leaving unrelated and local-only skills alone', async () => {
  const agentsDir = await mkdtemp(join(tmpdir(), 'agent-skills-prune-'));
  try {
    await mkdir(join(agentsDir, 'skills', 'orca-cli'), { recursive: true });
    await mkdir(join(agentsDir, 'skills', 'prev-only'), { recursive: true });
    await writeFile(
      join(agentsDir, '.skill-lock.json'),
      JSON.stringify({
        version: 3,
        skills: {
          'adi-mode': { source: '/repo/agent-skills', sourceType: 'local' },
          'dev-loop-build': { source: '/repo/agent-skills', sourceType: 'local' },
          herdr: { source: 'herdrdev/herdr', sourceType: 'github' },
          'code-review': { source: 'mattpocock/skills', sourceType: 'github' },
          'cloudflare-one': { source: 'cloudflare/skills', sourceType: 'github' },
          'unrelated-third-party': { source: 'someone/else', sourceType: 'github' },
        },
      })
    );
    await writeFile(
      join(agentsDir, '.agent-skills-managed.json'),
      JSON.stringify({ version: 1, skills: ['adi-mode', 'prev-only', 'already-gone'] })
    );

    const stale = findStaleSkills(agentsDir, ['adi-mode'], { ownRoot: '/repo/agent-skills' });
    assert.deepEqual(stale, ['cloudflare-one', 'code-review', 'dev-loop-build', 'herdr', 'prev-only']);
  } finally {
    await rm(agentsDir, { recursive: true, force: true });
  }
});

test('stops after first failed installation', async () => {
  const commands = [
    { label: 'One', args: [] },
    { label: 'Two', args: [] },
    { label: 'Three', args: [] },
  ];
  const attempted = [];
  await assert.rejects(
    executeCommands(commands, async (command) => {
      attempted.push(command.label);
      return command.label === 'Two' ? 7 : 0;
    }),
    /Two failed \(7\)/
  );
  assert.deepEqual(attempted, ['One', 'Two']);
});

test('marks manual-only skills for Codex and leaves existing policy files alone', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-skills-codex-'));
  const skill = async (name, skillMd, yaml) => {
    await mkdir(join(root, name), { recursive: true });
    await writeFile(join(root, name, 'SKILL.md'), skillMd);
    if (yaml === undefined) return;
    await mkdir(join(root, name, 'agents'));
    await writeFile(join(root, name, 'agents', 'openai.yaml'), yaml);
  };
  const yamlOf = (name) => readFileSync(join(root, name, 'agents', 'openai.yaml'), 'utf8');
  const flagged = '---\nname: x\ndisable-model-invocation: true\n---\n\nBody\n';
  const keyed = 'policy:\n  allow_implicit_invocation: true\n';
  const unkeyed = 'interface:\n  display_name: Unkeyed\n';
  try {
    await skill('flagged', flagged);
    await skill('plain', '---\nname: plain\n---\n\nBody\n');
    await skill('keyed', flagged, keyed);
    await skill('unkeyed', flagged, unkeyed);
    await skill('body-flag', '---\nname: body-flag\n---\n\ndisable-model-invocation: true\n');

    const warnings = [];
    const names = ['flagged', 'plain', 'keyed', 'unkeyed', 'body-flag', 'missing'];
    assert.deepEqual(markCodexManualOnly(root, names, (message) => warnings.push(message)), ['flagged']);
    assert.deepEqual(markCodexManualOnly(root, names, () => {}), []);
    assert.equal(yamlOf('flagged'), 'policy:\n  allow_implicit_invocation: false\n');
    assert.equal(existsSync(join(root, 'plain', 'agents')), false);
    assert.equal(existsSync(join(root, 'body-flag', 'agents')), false);
    assert.equal(yamlOf('keyed'), keyed);
    assert.equal(yamlOf('unkeyed'), unkeyed);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /\bunkeyed\b/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('install marks only installed skills, prunes stale managed ones, and records manifest when --prune is set', async () => {
  const home = await mkdtemp(join(tmpdir(), 'agent-skills-home-'));
  const cwd = await mkdtemp(join(tmpdir(), 'agent-skills-cwd-'));
  const flagged = '---\nname: x\ndisable-model-invocation: true\n---\n';
  const yaml = (base, name) => existsSync(join(base, '.agents', 'skills', name, 'agents', 'openai.yaml'));
  try {
    for (const [base, name] of [[home, 'm'], [cwd, 'm'], [cwd, 'other']]) {
      await mkdir(join(base, '.agents', 'skills', name), { recursive: true });
      await writeFile(join(base, '.agents', 'skills', name, 'SKILL.md'), flagged);
    }
    await writeFile(
      join(home, '.agents', '.skill-lock.json'),
      JSON.stringify({
        version: 3,
        skills: {
          herdr: { source: 'herdrdev/herdr', sourceType: 'github' },
          m: { source: '/own/agent-skills', sourceType: 'local' },
        },
      })
    );

    const selected = [{ label: 'One', source: 'one', skills: [{ name: 'm' }] }];
    await assert.rejects(
      installBundle(selected, { agents: [], global: true, prune: true }, { run: async () => 1, home, cwd })
    );
    assert.equal(yaml(home, 'm'), false);
    assert.equal(existsSync(join(home, '.agents', '.agent-skills-managed.json')), false);

    assert.deepEqual(
      await installBundle(selected, { agents: [], global: false, prune: false }, { run: async () => 0, home, cwd }),
      ['m']
    );
    assert.equal(yaml(cwd, 'm'), true);
    assert.equal(yaml(cwd, 'other'), false);
    assert.equal(yaml(home, 'm'), false);

    const ran = [];
    await installBundle(
      selected,
      { agents: ['codex'], global: true, prune: true },
      {
        run: async (command) => {
          ran.push(command);
          return 0;
        },
        home,
        cwd,
        ownRoot: '/own/agent-skills',
      }
    );
    assert.equal(ran.length, 2);
    assert.deepEqual(ran[1].args, ['-y', 'skills', 'remove', 'herdr', '--global', '--yes']);
    assert.deepEqual(
      JSON.parse(readFileSync(join(home, '.agents', '.agent-skills-managed.json'), 'utf8')),
      { version: 1, skills: ['m'] }
    );
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});
