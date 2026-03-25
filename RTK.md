# RTK for Codex on Windows

This repository uses RTK in Codex through instructions, not through an
automatic shell hook.

## What This Means

- Codex reads `AGENTS.md` and this file at session start.
- In Codex, RTK usage is `best effort` and explicit: shell commands should
  start with `rtk ...` or `rtk proxy ...`.
- Do not assume Claude-style or Gemini-style auto-rewrite behavior here.
- `rtk verify` may warn that no hook is installed. For Codex, that is expected
  and is not a failure by itself.
- Changes to these instructions should be validated in a new Codex session.

## Command Priority

1. Prefer a dedicated RTK subcommand.
2. If there is no suitable RTK subcommand, use `rtk proxy ...`.
3. Do not fall back to a plain shell command when RTK can run or proxy it.

## Common Replacements

| Task | Prefer | Notes |
| --- | --- | --- |
| Read a file | `rtk read AGENTS.md` | Use instead of `Get-Content` or `cat`. |
| Find files by name | `rtk find "*.ts" src` | Use for path discovery. |
| Search file content | `rtk proxy powershell -NoProfile -Command "Get-ChildItem -Recurse -File src \| Select-String -Pattern 'pattern'"` | Use this PowerShell fallback when `rtk grep` is not usable in this Windows environment. |
| Git status, diff, log | `rtk git status`, `rtk git diff`, `rtk git log -n 10` | Prefer RTK for normal git inspection. |
| Run tests | `rtk vitest run` or `rtk test pnpm test` | Prefer the dedicated RTK test wrapper when available. |
| Typecheck, lint, build | `rtk tsc`, `rtk lint`, `rtk pnpm build` | Use RTK-wrapped checks first. |
| Package manager inspection | `rtk pnpm list`, `rtk pnpm outdated` | Keep dependency output compact. |
| PowerShell-only fallback | `rtk proxy powershell -NoProfile -Command "<cmd>"` | Use when the action is PowerShell-native and RTK has no direct subcommand. |

## Verification in Codex

Use these checks when validating adoption in this repo:

```bash
rtk --version
rtk gain
rtk gain --history
```

Codex-specific verification rules:

- Inspect actual `shell_command` calls in the current rollout when debugging
  adoption.
- Success means commands in the new session are issued as `rtk ...` or
  `rtk proxy ...`.
- `rtk gain --history` should show the new commands.
- Non-zero savings should appear for at least one normal RTK-filtered workflow
  such as `rtk git status` or `rtk find`.

## Non-Goal

Do not describe Codex RTK integration as an installed hook. In this repository,
the supported model is instruction-based RTK usage for Codex on Windows
PowerShell.
