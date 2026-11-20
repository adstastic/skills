# Agent Skills Bundle

Custom portable skills plus dependency management for skills maintained in other repositories, behind one minimal installer powered by [`npx skills`](https://github.com/vercel-labs/skills).

Each local skill directory contains a `SKILL.md` with operating instructions and optional helper scripts. Skills are agent-agnostic where possible; tool-specific skills still assume the named CLI exists on `PATH`.

## Skills

- `adi-mode` — Adi's working style on top of pstack's `poteto-mode`: go gates, autonomy backed by verification, a pre-PR review loop, and a catch-up after each merge.
- `audit-all-my-stuff` — audit someone's devices, accounts, websites, home network, and self-hosted services against current vulnerabilities, with or without a supplied vulnerability list.
- `boxd-subagents` — delegate coding tasks to forked boxd VMs using the existing `codex-base`, `claude-base`, or `pi-base`, resume native sessions, and collect results without terminal automation.
- `deep-research-pro` — run ChatGPT Deep Research or extended-thinking GPT Pro consults through Oracle using Adi's logged-in ChatGPT Pro profile.
- `ios-device-runner` — build, install, and launch an iOS app on a physical device; configure with CLI flags, env vars, or a private `--config` file.
- `review-baseline` — apply a shared adversarial evidence bar to specialized review analysis.
- `security-privacy-review` — audit a PR, diff, or codebase for security and privacy risks.
- `shape-of-system` — structural-correctness review lens focused on structure over vigilance, bounded cognition, trust boundaries, and blast radius.
- `ste-writing` — write in ASD-STE100 Simplified Technical English, with a bundled linter and a dictionary lookup for the standard.

The installer also installs these directly from their upstream repositories:

- [Agent Browser](https://github.com/vercel-labs/agent-browser)
- [Thermos](https://github.com/cursor/plugins/tree/main/thermos) (`thermo-nuclear-review`)
- [Matt Pocock's skills](https://github.com/mattpocock/skills) (`codebase-design`, `diagnosing-bugs`)
- [Cloudflare skills](https://github.com/cloudflare/skills) (`cloudflare`, `wrangler`, `workers-best-practices`, `durable-objects`, `agents-sdk`)
- [trycycle](https://github.com/danshapiro/trycycle)
- [pstack](https://github.com/cursor/plugins/tree/main/pstack)

They are not vendored, and their full catalogs are not snapshotted here. The installer stores only source URLs and curated default names, reads current skill names from [`npx skills`](https://github.com/vercel-labs/skills), and installs content directly from upstream; plugin hooks and tools stay out of scope.

## Layout

```text
<skill>/
  SKILL.md
  scripts/            # optional helper scripts
  state/              # optional local state, ignored by git
bin/install.mjs       # live unified installer
```

## Install

Run the interactive installer directly from GitHub:

```bash
npx github:adstastic/skills
```

The installer loads every current upstream catalog, lets you search and select skills from each source, then asks project/global scope, coding agents, and symlink/copy method once. It validates each parsed catalog count before showing choices and aborts rather than silently presenting a partial list. `--yes` installs the curated defaults without prompts, and `--prune` removes skills from managed or retired bundle sources that are no longer selected while leaving local-only and unrelated third-party skills untouched. After the install, it writes `agents/openai.yaml` into each skill marked `disable-model-invocation: true`, so Codex also keeps those skills manual-only.

For the non-interactive personal preset, clone the repo and run:

```bash
./sync-skills
```

This installs every local skill plus the curated upstream subset globally for Claude Code and Codex, and prunes any managed skills dropped from the bundle. Pi discovers the same canonical `~/.agents/skills` installation. It also links `~/.agents/pstack-models.md` to this repo's `pstack-models.md`, so edit that file to change the models pstack uses in Claude Code, Codex and Pi. pstack skills read it only when your global agent instructions or adi-mode point at it. Run it again to fetch upstream changes or restore the bundle on another machine.

For a one-off Pi session without installing globally:

```bash
pi --skill /path/to/skills
```

Helper scripts use relative paths in docs. If your agent runs from another directory, set a `SKILLS_DIR` env var or replace `./<skill>/scripts/...` with an absolute path in your local copy.
