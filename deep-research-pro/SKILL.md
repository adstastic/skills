---
name: deep-research-pro
description: Use Adi's logged-in ChatGPT Pro subscription through Oracle browser automation/MCP for ChatGPT Deep Research or extended-thinking GPT Pro consults. Use when the user asks for deep research, cited web research, market/library/company research, broad source comparison, or to consult ChatGPT Pro / GPT Pro / Oracle for a second opinion, long reasoning pass, or code-context review.
---

# Deep Research & GPT Pro

Use Oracle to run ChatGPT Deep Research or extended-thinking ChatGPT Pro consults from Adi's signed-in ChatGPT Pro browser profile without manual copy/paste.

## Modes

- **Deep Research (`browserResearchMode: "deep"`):** Broad public-web research with citations, market/library/company comparison, and structured research reports. Put the full research plan in the initial prompt — Oracle rejects browser follow-ups with Deep Research.
- **GPT Pro Consult (default browser mode, no `browserResearchMode`):** Second opinions, long reasoning passes, or architecture/code review with attached file context. Attach files generously — Oracle starts with no repo context unless files are attached.

## Defaults

- Prefer MCP tool `oracle.consult` when available.
- Use preset `chatgpt-pro-heavy`.
- Run `dryRun: true` first for new/unclear tasks.
- For long outputs/reports, fetch full session detail after completion; do not rely on the `consult` log tail.

## MCP Usage

### Deep Research

Dry run:

```json
{
  "preset": "chatgpt-pro-heavy",
  "browserResearchMode": "deep",
  "prompt": "Research <topic>. Cite sources. Compare evidence. Produce concise report.",
  "files": [],
  "dryRun": true
}
```

Live run:

```json
{
  "preset": "chatgpt-pro-heavy",
  "browserResearchMode": "deep",
  "prompt": "Research <topic>. Cite sources. Compare evidence. Produce concise report.",
  "files": []
}
```

### GPT Pro Consult (with file context)

Dry run:

```json
{
  "preset": "chatgpt-pro-heavy",
  "prompt": "<prompt>",
  "files": ["src/**/*.ts"],
  "dryRun": true
}
```

Live run:

```json
{
  "preset": "chatgpt-pro-heavy",
  "prompt": "<prompt>",
  "files": ["src/**/*.ts"]
}
```

### Fetch full output

After any live run whose answer may exceed the log tail, call `sessions` with:

```json
{
  "id": "<sessionId>",
  "detail": true
}
```

## Deep Research Prompt Shape

Include:

1. Research question.
2. Scope boundaries.
3. Desired sources or domains, if any.
4. Required output format.
5. Decision criteria.

Example prompt:

```text
Research current best options for invoking logged-in AI provider subscriptions from CLI coding agents. Focus on ChatGPT Pro, Claude Pro/Max, Gemini Advanced, and Perplexity Pro. Compare official APIs, browser automation, MCP servers, reliability, ToS/security risks, and setup complexity. Cite sources. End with recommendation for a macOS Pi coding-agent workflow.
```

## CLI Fallback

If MCP is unavailable, invoke Oracle directly.

Deep Research:

```bash
npx -y @steipete/oracle \
  --engine browser \
  --browser-manual-login \
  --browser-manual-login-profile-dir ~/.oracle/browser-profile \
  --browser-research deep \
  --browser-timeout 2h \
  --browser-auto-reattach-delay 30s \
  --browser-auto-reattach-interval 60s \
  --browser-auto-reattach-timeout 3m \
  -p "<research prompt>"
```

GPT Pro consult with files:

```bash
npx -y @steipete/oracle \
  --engine browser \
  --browser-manual-login \
  --browser-manual-login-profile-dir ~/.oracle/browser-profile \
  --model gpt-5.5-pro \
  --browser-thinking-time extended \
  --browser-auto-reattach-delay 5s \
  --browser-auto-reattach-interval 10s \
  --browser-auto-reattach-timeout 2m \
  -p "<prompt>" \
  --file "src/**/*.ts"
```

First-time / login smoke test:

```bash
npx -y @steipete/oracle \
  --engine browser \
  --browser-manual-login \
  --browser-manual-login-profile-dir ~/.oracle/browser-profile \
  --browser-keep-browser \
  --browser-input-timeout 120s \
  --browser-timeout 5m \
  --model gpt-5.5-pro \
  --browser-thinking-time extended \
  -p "Setup smoke test. Reply with exactly: ORACLE_OK"
```

Fetch full session/report:

```bash
npx -y @steipete/oracle session <session-id> --render
```

## Important

- Browser automation may focus/control visible Chrome.
- Never pass inline cookies unless user explicitly asks.
- Use persistent profile `~/.oracle/browser-profile`.
- If a run is active, times out, or detaches, reattach instead of starting duplicate expensive/long runs.
- Local artifacts live under `~/.oracle/sessions/<id>/artifacts/`; Deep Research reports may be saved as `deep-research-report.md`.
