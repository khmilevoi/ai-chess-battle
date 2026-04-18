<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (90-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk vitest run          # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%)
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A local web app for playing chess matches: Human vs Human, Human vs AI, or AI vs AI. AI providers (OpenAI, Anthropic, Google) are configured per-side via a credential vault stored in localStorage. No backend — everything runs in the browser.

## Commands

```bash
pnpm dev            # Start Vite dev server
pnpm build          # tsc + vite build
pnpm lint           # ESLint
pnpm test           # vitest run (single pass)
pnpm test:watch     # vitest watch

# Run a single test file
rtk vitest run src/path/to/file.test.ts
# Run tests matching a name pattern
rtk vitest run -t "test name pattern"
```

## Architecture

**State management**: [Reatom](https://reatom.dev/) (reactive atoms). All state lives in atoms; components subscribe via `useAtom`. Use `atom()`, `action()`, `computed()`, `effect()`, `withAsync()`, `withAbort()`.

**Routing**: Custom `reatomRoute()` in `src/app/routes.tsx` — path patterns with loaders and render functions, no React Router.

**Actor system** (`src/actors/`): Pluggable players defined with `defineActor()`. Each actor has:
- `ActorDescriptor` — metadata + factory
- `ActorControlsContract` — Zod schema for persisted config, default state, UI controls
- `InteractiveActor` (human, waits for user input) vs `AutonomousActor` (AI, auto-moves)

Adding a new AI provider: implement `AutonomousActor` and register in the actor registry.

**Chess domain** (`src/domain/chess/`): Thin facade over `chess.js`. All chess logic goes through `ChessEngine`; raw `chess.js` calls should not appear outside this module.

**Features** (`src/features/`):
- `match-setup` — configure actors per side, start game
- `game` — active match board + move history
- `games` — archive of completed games

**Storage** (`src/shared/storage/`): localStorage-backed atoms. `gameSessionStorage` persists active game; `matchConfigStorage` persists match setup. Games are archived on completion.

**Credential vault** (`src/app/vault/`): API keys stored encrypted in localStorage. Actors read keys via vault atoms; the vault modal is triggered reactively when a key is missing.

**Error handling**: Tagged errors via `errore` library. `ActorError`, `EngineError`, and provider-specific subtypes. Match errors by tag, not instanceof.

**Gate pattern**: `reatomGate` (see `src/actors/ai-actor/model.ts`) — async confirmation flow that suspends an action until the user confirms or cancels (used for "confirm before AI API call" feature).

## Key Patterns

- `reatomMemo` wraps React components for memoization with Reatom context
- Zod schemas define actor config shape and validate localStorage data
- All AI actor controls share a common base via `src/actors/ai-actor/`; provider-specific actors (`openai-actor`, `anthropic-actor`, `google-actor`) extend it
- Test setup file: `src/test/setup.ts`
