# Agent Instructions

This repository uses Superpowers through Codex native skill discovery.

Requirements from the Superpowers Codex documentation:

- Skills are discovered from `~/.agents/skills/superpowers` when Codex starts.
- Do not add or restore the old `superpowers-codex bootstrap` block in `~/.codex/AGENTS.md`.
- Restart Codex after installing or updating Superpowers so skill discovery runs again.
- For subagent skills such as `dispatching-parallel-agents` and `subagent-driven-development`, enable this in Codex config:

```toml
[features]
multi_agent = true
```

No additional bootstrap configuration is required in this project.

## RTK in Codex

For Codex in this repository, treat `AGENTS.md` + `RTK.md` as the supported
RTK instruction pair.

- Keep the `@RTK.md` reference below.
- For any `shell_command`, prefer an explicit `rtk ...` command over the raw
  shell equivalent.
- If RTK does not provide a suitable subcommand, use the documented
  `rtk proxy ...` fallback instead of a plain shell command.
- Verify Codex RTK behavior through actual `shell_command` usage plus
  `rtk gain` or `rtk gain --history`.
- Do not treat `rtk verify` reporting `RTK hook not installed` as a defect in
  this repo. Codex uses instruction-based RTK integration, not a Bash hook.
- Do not rely on `CLAUDE.md` for Codex behavior in this repository.

@RTK.md
