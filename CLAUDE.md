# Claude Code instructions

@AGENTS.md

`AGENTS.md` (imported above) is the single source of project instructions. This file only adds Claude Code specifics; edit project rules in `AGENTS.md`, not here.

## Claude Code specifics

- Before reporting a task as finished, run the complete local validation defined in `AGENTS.md` (lint, format check, unit tests, build and browser tests) and report the real results, including failures and skipped checks.
- Use plan mode before changes that touch the state/hash format (`src/core.ts`), IndexedDB storage (`src/saved-routes.ts`), routing, the CI workflow or repository rules and settings.
- Do not commit, push, create branches or open pull requests without an explicit request. Never rerun old CI executions.
- When adding a third-party service or map layer, also update `README.md`, `help.html`, privacy disclosures and credits. Repository text stays in English; Portuguese text remains required only for the website interface (`src/i18n.ts` and help).
- Claude Code settings and permissions are not versioned: they live in the user-level `~/.claude/settings.json`. The `.claude/` directory is ignored; personal project notes go in the ignored `CLAUDE.local.md`.
