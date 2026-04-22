# Arbiter Feature — Design Spec

**Date:** 2026-04-22
**Status:** Revised design, ready for implementation plan
**Scope:** Optional third AI module that evaluates the position after every applied move, renders an evaluation bar next to the board, and shows a short witty comment as a board-local toast.

---

## 1. Context

The app already has two actor slots (`white` and `black`) that make moves. This feature adds a third configurable AI module, the **arbiter**, that never plays a move itself. After each applied move, it evaluates the resulting position and returns:

1. A centipawn score for the evaluation bar.
2. A short witty one-line comment for a live board-local toast.

The arbiter is aimed at spectatorship, especially in AI vs AI matches. It must stay strictly out of the turn loop: arbiter failures never block move application, persistence, or game-over handling.

---

## 2. Locked Decisions

- **Optional role**: match setup includes `None`; matches without an arbiter should look and behave exactly like today.
- **Shared secrets, separate defaults**: API keys continue to live in the existing provider vault (`openai`, `anthropic`, `google`), but arbiter model/settings defaults are stored separately from white/black actor defaults.
- **Persisted per move**: saved games keep an optional `evaluations` array containing `{ score, comment } | null` entries.
- **Queue every move**: arbiter requests are processed in move order. We do not cancel older evaluations just because newer moves arrive.
- **Live-only toast**: witty comments are persisted, but the toast only appears for live play, never while scrubbing history.
- **History-following eval bar**: the bar follows the current history cursor. If the cursor points at a move without an evaluation, the bar shows a disabled hatched state.
- **No initial-position eval**: the arbiter evaluates only after real moves. Cursor `0` always shows the disabled state.
- **No mate notation**: score is an integer centipawn value clamped to `[-1000, 1000]`.
- **English only**: prompts and UI copy stay in English.
- **No confirmation gate**: arbiter requests are silent and non-blocking.
- **Narrow arbiter config**: arbiter setup exposes provider + model only. Provider-specific extras are fixed in code for MVP.
- **OpenAI arbiter reasoning**: use a fixed OpenAI reasoning effort of `low` in code, not a user setting.

---

## 3. Architecture

### 3.1 Arbiter is a separate role, not an actor side

The arbiter should not be forced into the existing `ActorDescriptor` shape. Actor infrastructure is built around `requestMove()`, move validation, confirmation, retry, and interactive controls. The arbiter does not fit that contract.

Instead:

- Add a new `ArbiterDescriptor` type and `arbiterRegistry` under `src/arbiter/`.
- Keep `MatchConfig.white` and `MatchConfig.black` unchanged.
- Extend `MatchConfig` with a new orthogonal field: `arbiter: ArbiterSideConfig | null`.

### 3.2 `GameModel` owns arbiter orchestration

The current UI is driven entirely through `createGameModel()`, and the test suite already validates behavior through that model surface. To match the existing architecture:

- `src/arbiter/` contains arbiter-specific types, schema, prompt builders, and provider adapters.
- `src/features/game/model.ts` owns arbiter queue state, hydrated evaluations, live toast payload, and persistence writes.
- `GamePage` consumes arbiter state through `GameModel` getters, not by directly subscribing to a second feature store.

This keeps the arbiter isolated as a domain module while preserving the app's current feature boundary.

### 3.3 Arbiter module layout

```text
src/arbiter/
├── types.ts                     # ArbiterDescriptor, ArbiterConfig, ArbiterSideConfig, Eval
├── schema.ts                    # arbiterEvaluationSchema
├── request.ts                   # buildArbiterInstructions(), buildArbiterPrompt(), parseArbiterResponseJson()
├── registry.ts                  # arbiterRegistry + lookup
├── openai/{index.ts, model.ts}
├── anthropic/{index.ts, model.ts}
└── google/{index.ts, model.ts}
```

No arbiter-owned atom store is introduced. Runtime queue state stays inside `GameModel`.

### 3.4 Config and storage shape

Add a parallel arbiter config shape instead of reusing actor config types directly:

```ts
type ArbiterProviderKey = 'openai' | 'anthropic' | 'google'

type OpenAiArbiterConfig = {
  model: string
}

type AnthropicArbiterConfig = {
  model: string
}

type GoogleArbiterConfig = {
  model: string
}

type ArbiterSideConfig =
  | { arbiterKey: 'openai'; arbiterConfig: OpenAiArbiterConfig }
  | { arbiterKey: 'anthropic'; arbiterConfig: AnthropicArbiterConfig }
  | { arbiterKey: 'google'; arbiterConfig: GoogleArbiterConfig }
```

Implications:

- `StoredMatchConfig` also gains `arbiter?: StoredArbiterSideConfig | null`.
- Add a dedicated arbiter defaults store, e.g. `src/shared/storage/arbiterConfigStorage.ts`.
- Do **not** reuse `actorConfigStorage`, because it stores by provider key and would make arbiter model changes overwrite white/black defaults for the same provider.

### 3.5 Match setup reuse strategy

`src/actors/ai-actor/providerSettings.tsx` is still reusable, but not raw.

- Create a thin arbiter-specific wrapper around `AiProviderSettings`.
- Let the wrapper bridge arbiter model-only config to the existing vault-managed API-key UI.
- Reuse existing provider model option lists from the AI actor config files.
- Do not expose OpenAI reasoning effort in arbiter setup; the wrapper only edits `model`.

### 3.6 Post-move integration and queueing

Integration point remains immediately after `persistSnapshot(nextSnapshot)` succeeds inside `applyResolvedMove()`.

Behavior:

1. A move is applied.
2. The new snapshot is persisted.
3. If an arbiter is configured, enqueue a job for that move index.
4. A single arbiter worker drains the queue sequentially.

Important rules:

- Every applied move gets queued once.
- Queue order matches move order.
- Scrubbing history does not touch the queue.
- New moves do not cancel older queued evaluations.
- The only abort boundary is match teardown (`resetState`, dispose, leaving the page).

### 3.7 Runtime state owned by `GameModel`

`createGameModel()` should own:

- `arbiterRuntimeAtom: ArbiterRuntime | null`
- `arbiterQueueAtom: Array<{ moveIndex: number; snapshot: BoardSnapshot }>`
- `arbiterInFlightAtom: { moveIndex: number; controller: AbortController } | null`
- `evaluationsByMoveAtom: Array<Eval | null>`
- `arbiterLiveCommentAtom: { id: number; side: 'white' | 'black'; text: string; createdAt: number } | null`
- `arbiterWarningShownAtom: boolean`

`Eval` is:

```ts
type Eval = {
  score: number
  comment: string
}
```

### 3.8 Cursor semantics

The saved move list and the history cursor are move-count based:

- `historyCursor === 0` means the initial position.
- `historyCursor === 1` means the position after move 1.

Therefore the current eval lookup is:

```ts
const evalForCursor =
  historyCursor === 0 ? null : evaluationsByMove[historyCursor - 1] ?? null
```

This avoids the off-by-one issue in the original draft.

### 3.9 Live toast semantics

The live toast is only shown when all of the following are true when an evaluation completes:

- the evaluated move is the latest move in the game,
- the user is on the live tail,
- the evaluation succeeded.

If an older queued evaluation completes after newer moves have already landed:

- persist it into `evaluationsByMoveAtom`,
- update the saved game record,
- do **not** show or replace the live toast.

### 3.10 Prompt and provider behavior

**Schema**:

```ts
export const arbiterEvaluationSchema = z.object({
  score: z.number().int().min(-1000).max(1000),
  comment: z.string().min(1).max(240),
})
```

**System prompt**:

> You are a witty chess arbiter. After each move you receive a position and the move just played. Respond with strict JSON: `{ "score": <integer centipawns, positive favors white, negative favors black, clamped to [-1000, 1000]>, "comment": <one witty, friendly sentence under 240 characters, no markdown, no long analysis> }`.

**User payload**:

```json
{
  "fen": "<snapshot.fen>",
  "lastMove": { "uci": "<snapshot.lastMove.uci>", "side": "white" | "black" },
  "moveNumber": <snapshot.history.length>,
  "recentHistory": ["e2e4", "c7c5", "... up to last 10 plies"]
}
```

Provider adapters should copy the low-level SDK call pattern from the current AI actor providers, but not the actor retry wrapper. Errors are logged and treated as non-blocking.

---

## 4. UI

### 4.1 Match setup

Add an `ArbiterCard` below the white/black actor cards in [MatchSetupPage.tsx](/C:/Users/Khmil/JsProjects/ai-chess-battle/src/features/match-setup/MatchSetupPage.tsx).

Behavior:

- Provider select options: `None`, `OpenAI`, `Anthropic`, `Google`
- `None` hides provider settings and resolves to `null`
- Provider selected:
  - render the arbiter provider settings wrapper,
  - reuse the vault-managed API key input,
  - edit arbiter model only,
  - validate that a vault secret exists for the chosen provider

Persistence:

- save arbiter defaults to the dedicated arbiter defaults store
- save the current arbiter choice into `storedMatchConfig`

### 4.2 Saved setup panel

The current match info panel is white/black only. Do not force the arbiter into the same `MatchInfoEntry` side union.

Instead:

- keep white/black match info entries as they are,
- add a separate arbiter info section when `config.arbiter !== null`,
- show provider display name and saved model,
- never show API keys.

### 4.3 Eval bar

Add `EvalBar` beside the board.

- Hidden entirely when `config.arbiter === null`
- Disabled hatched state for cursor `0`
- Disabled hatched state for missing or failed evals
- Boundary and numeric label render from the current cursor's score
- Reduced-motion mode disables transitions

### 4.4 Arbiter toast layer

Add a board-local toast layer inside `.boardZone`, not via the global `ToastViewport`.

- White move comment: bottom-right
- Black move comment: top-left
- One arbiter toast visible at a time
- Auto-dismiss after 6s
- Pause on hover/focus
- Dismiss via close button or `Esc`

The global toast system is reused only for the rate-limited `"Arbiter unavailable"` warning.

---

## 5. Persistence

### 5.1 Saved match config

Extend stored match config:

```ts
type StoredMatchConfig = {
  white: StoredSideConfig
  black: StoredSideConfig
  arbiter?: StoredArbiterSideConfig | null
}
```

Missing `arbiter` means legacy data and should resolve to `null`.

### 5.2 Saved game record

Extend stored game snapshots:

```ts
type StoredGameRecordSnapshot = {
  // existing fields
  evaluations?: Array<{ score: number; comment: string } | null>
}
```

Semantics:

- field missing: no arbiter data exists for this game
- `null` entry: evaluation was attempted and failed, or was intentionally persisted as unavailable
- object entry: valid stored evaluation

### 5.3 Hydration and writes

- On match start, hydrate `evaluationsByMoveAtom` from `record.evaluations ?? []`
- Do not backfill missing or null entries on resume
- `persistSnapshot(nextSnapshot)` keeps doing move/state persistence
- Arbiter result persistence happens when each queued evaluation completes, via `updateStoredGameRecord(...)`

This avoids coupling move persistence to eventual arbiter completion.

### 5.4 Normalization

Normalization should:

- accept missing `evaluations`
- require array entries to be either `null` or a valid `{ score, comment }`
- coerce invalid entries to `null`
- preserve array length

---

## 6. File Map

| File | Action |
|---|---|
| `src/arbiter/types.ts` | NEW — arbiter descriptor/config/eval types |
| `src/arbiter/schema.ts` | NEW — arbiter evaluation schema |
| `src/arbiter/request.ts` | NEW — system prompt, user payload, response parsing |
| `src/arbiter/registry.ts` | NEW — arbiter registry and lookup |
| `src/arbiter/{openai,anthropic,google}/{index.ts,model.ts}` | NEW — provider runtimes |
| [src/actors/types.ts](/C:/Users/Khmil/JsProjects/ai-chess-battle/src/actors/types.ts) | extend `MatchConfigFromRegistry` or replace with a `MatchConfig` type that includes `arbiter` |
| [src/actors/registry.ts](/C:/Users/Khmil/JsProjects/ai-chess-battle/src/actors/registry.ts) | `createDefaultMatchConfig()` returns `{ white, black, arbiter: null }` |
| [src/shared/storage/helpers.ts](/C:/Users/Khmil/JsProjects/ai-chess-battle/src/shared/storage/helpers.ts) | stored/resolved arbiter config helpers |
| `src/shared/storage/arbiterConfigStorage.ts` | NEW — arbiter defaults store, separate from actor config storage |
| [src/shared/storage/matchConfigStorage.ts](/C:/Users/Khmil/JsProjects/ai-chess-battle/src/shared/storage/matchConfigStorage.ts) | persist `arbiter` in saved setup |
| [src/shared/storage/gameSessionStorage.ts](/C:/Users/Khmil/JsProjects/ai-chess-battle/src/shared/storage/gameSessionStorage.ts) | persist and normalize `evaluations` |
| [src/features/match-setup/model.ts](/C:/Users/Khmil/JsProjects/ai-chess-battle/src/features/match-setup/model.ts) | arbiter state, validation, setup persistence |
| [src/features/match-setup/MatchSetupPage.tsx](/C:/Users/Khmil/JsProjects/ai-chess-battle/src/features/match-setup/MatchSetupPage.tsx) | render `ArbiterCard` |
| [src/features/game/model.ts](/C:/Users/Khmil/JsProjects/ai-chess-battle/src/features/game/model.ts) | arbiter runtime, queue, hydrated evaluations, live toast, persistence updates |
| [src/features/game/GamePage.tsx](/C:/Users/Khmil/JsProjects/ai-chess-battle/src/features/game/GamePage.tsx) | render EvalBar, arbiter toast layer, arbiter match info |
| [src/features/game/GamePage.module.css](/C:/Users/Khmil/JsProjects/ai-chess-battle/src/features/game/GamePage.module.css) | board/eval bar layout and toast positioning context |
| `src/features/game/EvalBar.{tsx,module.css}` | NEW |
| `src/features/game/ArbiterToastLayer.{tsx,module.css}` | NEW |

---

## 7. Step-by-Step Implementation

1. **Arbiter domain module**
   - Add arbiter types, schema, prompt builder, parser, and registry.
   - Add provider runtimes for OpenAI, Anthropic, and Google.
   - Unit-test prompt building and parsing.

2. **Config and storage**
   - Extend `MatchConfig`, `StoredMatchConfig`, and storage helpers with `arbiter`.
   - Add dedicated arbiter defaults storage.
   - Extend saved game records with `evaluations`.

3. **Match setup**
   - Add arbiter state and validation to the setup model.
   - Add `ArbiterCard` and provider settings wrapper UI.
   - Persist arbiter choice into stored match config.

4. **Game runtime**
   - Add arbiter runtime atoms to `createGameModel()`.
   - Hydrate saved evaluations on startup.
   - Enqueue a job after each successful persisted move.
   - Drain the queue sequentially.
   - Persist each evaluation as it completes.

5. **Game UI**
   - Add `EvalBar`.
   - Add board-local `ArbiterToastLayer`.
   - Add arbiter info to the saved setup panel.

6. **Polish and resilience**
   - Reduced-motion behavior
   - rate-limited warning toast
   - teardown abort handling
   - stale-result live-toast suppression

---

## 8. Verification

1. `pnpm dev`, open match setup.
2. **Off path**: `arbiter=None`
   - no eval bar
   - no arbiter toast
   - no arbiter network calls
3. **Happy path**
   - configure an arbiter provider with a vault key
   - play a move
   - one arbiter request is queued and completed
   - eval bar updates for the live tail
   - live toast appears in the corner for the side that moved
4. **Rapid AI vs AI**
   - multiple moves land faster than arbiter responses
   - requests complete in move order
   - evaluations are persisted for each move
   - older completions do not steal the live toast from the latest move
5. **History scrubbing**
   - cursor `0` shows disabled state
   - move `n` shows `evaluations[n - 1]`
   - missing or null entries show disabled state
   - no live arbiter toast appears while scrubbing
6. **Failure**
   - disconnect network
   - move still applies and persists
   - one global `"Arbiter unavailable"` warning appears for the match
   - failed move stores `null`
7. **Refresh / resume**
   - stored evaluations hydrate
   - old gaps remain gaps
   - only new moves are evaluated
8. **Tests**
   - arbiter request/parser tests
   - arbiter provider tests
   - `GameModel` queue and persistence tests
   - UI tests for arbiter setup, eval bar, and board-local toast
9. `pnpm test`, `pnpm lint`, and `pnpm build` pass.

---

## 9. Assumptions

- OpenAI arbiter reasoning effort is fixed to `low` for MVP.
- Persisting comments now is acceptable even though only the live toast currently renders them.
- The board orientation remains static for this feature; toast anchoring does not need to invert with perspective.
