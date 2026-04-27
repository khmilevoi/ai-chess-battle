# Arbiter — Current Evaluation Display & Auto-Request

## Goal

Make the arbiter's score and message in the game view always reflect the **most recent non-null evaluation up to the user's current history cursor**, including while scrubbing through move history. Additionally, when the user lands on a move that has no evaluation yet, automatically request one — and show a small in-flight indicator on the ticker while that request is outstanding.

Today the score (eval bar) already behaves correctly — it reads from `resolvedEvaluation`, which scans backward from the cursor for the latest non-null `Eval`. The comment (arbiter ticker) does not: it lives in a separate `arbiterLiveComment` atom that is only set when an evaluation lands while the user is at the latest move, and is explicitly cleared the moment the user navigates off-tail.

This spec aligns the comment with the score (single source of truth via `resolvedEvaluation`), adds a cursor-driven auto-request so the displayed evaluation is filled in for any move the user visits, and surfaces an "evaluating now" indicator while a request for the cursor's current move is queued or in-flight.

## Affected files

- `src/features/game/model.ts` — atom/effect changes, queue dedupe
- `src/features/game/ArbiterToastLayer.tsx` — props/rendering
- `src/features/game/ArbiterToastLayer.test.tsx` — update tests for new props
- `src/features/game/GamePage.tsx` — pass new prop shape to `ArbiterToastLayer`
- `src/features/game/model.test.ts` — update/extend tests

## Behavior

### Display
- **Eval bar:** unchanged. Reads `resolvedEvaluation.evaluation` (the same `Eval` it reads today).
- **Ticker:** shows `resolvedEvaluation.evaluation.comment`. Side coloring is computed from `getMoveSide(resolvedEvaluation.moveIndex)`.
- **Idle ticker** ("Arbiter online. Awaiting the next move."): shown when `resolvedEvaluation === null` — i.e. cursor is at `0`, or no non-null evaluation exists at or before the cursor.
- **Animation:** the ticker re-keys (slide-in animation re-fires) whenever `resolvedEvaluation.moveIndex` changes — including when the change is caused by scrubbing through history. Idle state uses key `'idle'`.
- **In-flight indicator:** a small pulsing status dot rendered next to the "Arbiter" label on the ticker is shown when `currentMoveEvaluating === true` (see model section). It is independent of the ticker text — the previously-resolved comment continues to scroll while the new request is outstanding.

### Auto-request
- Whenever the vault becomes unlocked, the cursor changes, or the evaluations array changes, if `cursor > 0` and `evaluationsByMove[cursor - 1]` is `null` or `undefined`, queue an arbiter evaluation for `moveIndex = cursor - 1`.
- The existing FIFO queue (`arbiterQueue`, `arbiterInFlight`, `runArbiterQueue`) processes the request normally.
- The explicit `queueArbiterEvaluation(...)` call inside `applyResolvedMove` is removed; the cursor effect handles the post-apply case (cursor advances to the new move's index after apply, the effect fires, and queues the request).

### Failure handling
- If the arbiter is unavailable or a request fails, the entry stays `null`. Revisiting the cursor will re-queue. Unlocking the vault while still on that cursor will also re-queue because the request effect depends on vault readiness. This matches the user-approved option (i) and gives free auto-recovery once the vault is unlocked, since the existing `arbiterWarningShown` flag suppresses duplicate toast warnings while still allowing the underlying request to retry.

## State changes (`src/features/game/model.ts`)

### Removed
- `arbiterLiveComment` atom and its `ArbiterLiveComment` type
- `dismissArbiterLiveComment` action
- `hideArbiterCommentOffTail` effect
- The "set `arbiterLiveComment`" block inside `runArbiterQueue` (the one guarded by `historyCursor() === latestMoveCount() && latestMoveCount() === nextEntry.moveIndex + 1`)
- The explicit `queueArbiterEvaluation(nextSnapshot.history.length - 1)` call inside `applyResolvedMove`
- `arbiterLiveComment` and `dismissArbiterLiveComment` from the model's returned object

### Modified — `resolvedEvaluation`
Returns the source `moveIndex` alongside the evaluation, so the ticker can color by side. The type is exported from `model.ts` and imported by `ArbiterToastLayer.tsx`:

```ts
export type ResolvedEvaluation = {
  evaluation: Eval
  moveIndex: number
}

const resolvedEvaluation = computed<ResolvedEvaluation | null>(() => {
  const cursor = historyCursor()
  if (cursor === 0) return null
  const evals = evaluationsByMove()
  for (let index = Math.min(cursor, evals.length) - 1; index >= 0; index -= 1) {
    const evaluation = evals[index]
    if (evaluation !== null && evaluation !== undefined) {
      return { evaluation, moveIndex: index }
    }
  }
  return null
}, `${name}.resolvedEvaluation`)
```

The model's returned `resolvedEvaluation` field has the new type.

### Modified — `queueArbiterEvaluation` (dedupe)
Skip if `moveIndex` is already queued or in-flight:

```ts
const queueArbiterEvaluation = action((moveIndex: number) => {
  if (peek(arbiterRuntime) === null) return null
  if (peek(arbiterInFlight)?.moveIndex === moveIndex) return null
  if (peek(arbiterQueue).some((entry) => entry.moveIndex === moveIndex)) return null

  arbiterQueue.set([...peek(arbiterQueue), { moveIndex }])
  if (peek(arbiterInFlight) === null) {
    void runArbiterQueue()
  }
  return moveIndex
}, `${name}.queueArbiterEvaluation`)
```

### Added — `requestMissingEvaluation` effect
```ts
effect(() => {
  const vaultStatus = vaultStatusAtom()
  if (vaultStatus !== 'unlocked') return

  const cursor = historyCursor()
  const evals = evaluationsByMove()

  if (cursor === 0) return
  const moveIndex = cursor - 1
  if (evals[moveIndex] !== null && evals[moveIndex] !== undefined) return

  queueArbiterEvaluation(moveIndex)
}, `${name}.requestMissingEvaluation`)
```

The `arbiterRuntime === null` short-circuit still lives inside `queueArbiterEvaluation` and applies here too. The explicit vault-readiness read is present so unlocking the vault re-runs the effect for the current cursor, even if the cursor did not change.

### Added — `currentMoveEvaluating` computed
Drives the ticker's in-flight indicator. True when the cursor's current move has an outstanding request (queued or in-flight); false otherwise. Derived state — no new atom storage. Both `arbiterInFlight` and `arbiterQueue` are accessed reactively (no `peek`) so the indicator flips immediately as entries enter/leave the queue.

```ts
const currentMoveEvaluating = computed(() => {
  const cursor = historyCursor()
  if (cursor === 0) return false
  const moveIndex = cursor - 1
  const inFlight = arbiterInFlight()
  if (inFlight?.moveIndex === moveIndex) return true
  return arbiterQueue().some((entry) => entry.moveIndex === moveIndex)
}, `${name}.currentMoveEvaluating`)
```

Exported on the model's returned object as `currentMoveEvaluating`.

### Preserved (no change to behavior)
- `arbiterQueue`, `arbiterInFlight`, `runArbiterQueue` — FIFO queue, sequential processing, abort handling, persistence via `persistArbiterEvaluation` (the only edit to `runArbiterQueue` is removing the live-comment write).
- `arbiterWarningShown`, `pushArbiterUnavailableWarning`, `refreshArbiterOnVaultChange` — failure messaging is unchanged.

## Component changes (`src/features/game/ArbiterToastLayer.tsx`)

### Props
```ts
import type { ResolvedEvaluation } from './model'

export function ArbiterToastLayer({
  evaluation,
  evaluating,
}: {
  evaluation: ResolvedEvaluation | null
  evaluating: boolean
}) { ... }
```

### Rendering
- `tickerText = evaluation?.evaluation.comment ?? IDLE_TICKER_TEXT`
- Side class:
  - `evaluation === null` → `styles.idle`
  - else `getMoveSide(evaluation.moveIndex) === 'white'` → `styles.whiteMove`, otherwise `styles.blackMove`
- Animation key on the `<div className={styles.track}>`: `evaluation?.moveIndex ?? 'idle'` (replaces the previous `comment?.id ?? 'idle'`).
- **In-flight dot:** a `<span className={styles.statusDot} aria-hidden="true" />` is rendered inside the label area when `evaluating === true`. CSS adds a pulse animation to make it visually active. The dot is omitted entirely when `evaluating === false` (no leftover element). For accessibility, when `evaluating === true`, append " (evaluating now)" to the ticker's `aria-label` (or use a visually-hidden `<span>` adjacent to the dot) so screen-reader users hear the status.
- `getMoveSide` is exported from `model.ts` (currently a private helper there) and imported here. No duplication.

### Removed
- The local `ArbiterLiveComment` type alias.

### CSS additions (`ArbiterToastLayer.module.css`)
- `.statusDot` — small circular indicator (e.g., 8×8px, accent color) positioned inside the label container.
- `@keyframes statusDotPulse` — opacity/scale pulse, ~1.2s cycle.
- Respect `prefers-reduced-motion`: under that media query the pulse is disabled (the dot still renders, just static).

## GamePage wiring (`src/features/game/GamePage.tsx`)

Replace:
```tsx
const arbiterLiveComment = model.arbiterLiveComment()
...
<ArbiterToastLayer comment={arbiterLiveComment} />
```
with:
```tsx
const resolvedEvaluation = model.resolvedEvaluation()
const currentMoveEvaluating = model.currentMoveEvaluating()
...
<ArbiterToastLayer
  evaluation={resolvedEvaluation}
  evaluating={currentMoveEvaluating}
/>
```

The `EvalBar` continues to receive `resolvedEvaluation` but reads only the `.evaluation` field — adjust the bar's prop access accordingly (`resolvedEvaluation?.evaluation ?? null`), or change `EvalBar`'s prop to `ResolvedEvaluation | null`. The simpler change is to pass `resolvedEvaluation?.evaluation ?? null` to `EvalBar` and keep its prop signature unchanged.

## Tests

### `src/features/game/model.test.ts`
Add cases:
1. **Resolved evaluation includes `moveIndex`**: after recording two evaluations (move 0 and move 2, with move 1 null), at cursor 3 the resolved entry has `moveIndex === 2`; at cursor 2 it has `moveIndex === 0`; at cursor 0 it's `null`.
2. **Auto-request on cursor visit**: with arbiter configured and the vault unlocked, a stored game with two moves and `evaluations: [null, null]`, navigating cursor to 1 enqueues a request for `moveIndex 0`; navigating to 2 enqueues a request for `moveIndex 1`. Use a fake arbiter that captures requested move indices.
3. **Dedupe**: navigating cursor multiple times across the same missing index does not enqueue duplicates while a request is in-flight or queued. Specifically: cursor → 1 (queued), cursor → 2 (queued), cursor → 1 again should not re-add `moveIndex 0`.
4. **Apply still triggers a request via the effect**: after a successful turn the new move's evaluation is enqueued (validates that removing the explicit call from `applyResolvedMove` did not regress).
5. **Vault unlock retriggers a missing current-cursor request**: with an arbiter-configured game, locked vault, cursor on a move whose evaluation is `null`, no provider request fires while locked; after `unlockVault(...)`, the same cursor queues the missing evaluation without requiring another history navigation.
6. **`currentMoveEvaluating` reflects queue/in-flight for the cursor's move**: with arbiter configured, navigate to a move with no eval; expect `currentMoveEvaluating === true` while the request is queued or in-flight. After the eval lands (and `evaluationsByMove` updates), expect `currentMoveEvaluating === false`. Navigating to a different cursor whose move is not queued/in-flight returns `false` even if some other move is still being evaluated.

Remove (or rewrite) tests that assert against `arbiterLiveComment` / `dismissArbiterLiveComment`.

### `src/features/game/ArbiterToastLayer.test.tsx`
Update for the new prop shape:
- `evaluation === null, evaluating = false` → idle text, idle class, no `.statusDot` rendered.
- `evaluation = { evaluation: { score, comment }, moveIndex: 0 }, evaluating = false` → comment text rendered, white-move class, no `.statusDot` rendered.
- `evaluation.moveIndex = 1, evaluating = false` → black-move class, no `.statusDot` rendered.
- `evaluating = true` (with any `evaluation`) → `.statusDot` element is present.
- Changing `moveIndex` re-keys the track (covered by React's keying — assert by querying for the keyed element if currently asserted).

## Out of scope
- Manual re-request UI for failed evaluations.
- Bulk back-fill of all missing evaluations on game load.
- Changes to arbiter providers, queue concurrency, or evaluation persistence shape.
