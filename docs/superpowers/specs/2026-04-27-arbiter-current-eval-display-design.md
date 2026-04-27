# Arbiter — Current Evaluation Display & Auto-Request

## Goal

Make the arbiter's score and message in the game view always reflect the **most recent non-null evaluation up to the user's current history cursor**, including while scrubbing through move history. Additionally, when the user lands on a move that has no evaluation yet, automatically request one.

Today the score (eval bar) already behaves correctly — it reads from `resolvedEvaluation`, which scans backward from the cursor for the latest non-null `Eval`. The comment (arbiter ticker) does not: it lives in a separate `arbiterLiveComment` atom that is only set when an evaluation lands while the user is at the latest move, and is explicitly cleared the moment the user navigates off-tail.

This spec aligns the comment with the score (single source of truth via `resolvedEvaluation`) and adds a cursor-driven auto-request so the displayed evaluation is filled in for any move the user visits.

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

### Auto-request
- Whenever the cursor or the evaluations array changes, if `cursor > 0` and `evaluationsByMove[cursor - 1]` is `null` or `undefined`, queue an arbiter evaluation for `moveIndex = cursor - 1`.
- The existing FIFO queue (`arbiterQueue`, `arbiterInFlight`, `runArbiterQueue`) processes the request normally.
- The explicit `queueArbiterEvaluation(...)` call inside `applyResolvedMove` is removed; the cursor effect handles the post-apply case (cursor advances to the new move's index after apply, the effect fires, and queues the request).

### Failure handling
- If the arbiter is unavailable or a request fails, the entry stays `null`. Revisiting the cursor will re-queue. This matches the user-approved option (i) and gives free auto-recovery once the vault is unlocked, since the existing `arbiterWarningShown` flag suppresses duplicate toast warnings while still allowing the underlying request to retry.

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
  const cursor = historyCursor()
  const evals = evaluationsByMove()

  if (cursor === 0) return
  const moveIndex = cursor - 1
  if (evals[moveIndex] !== null && evals[moveIndex] !== undefined) return

  queueArbiterEvaluation(moveIndex)
}, `${name}.requestMissingEvaluation`)
```

The `arbiterRuntime === null` short-circuit lives inside `queueArbiterEvaluation` and applies here too.

### Preserved (no change to behavior)
- `arbiterQueue`, `arbiterInFlight`, `runArbiterQueue` — FIFO queue, sequential processing, abort handling, persistence via `persistArbiterEvaluation` (the only edit to `runArbiterQueue` is removing the live-comment write).
- `arbiterWarningShown`, `pushArbiterUnavailableWarning`, `refreshArbiterOnVaultChange` — failure messaging is unchanged.

## Component changes (`src/features/game/ArbiterToastLayer.tsx`)

### Props
```ts
import type { ResolvedEvaluation } from './model'

export function ArbiterToastLayer({
  evaluation,
}: {
  evaluation: ResolvedEvaluation | null
}) { ... }
```

### Rendering
- `tickerText = evaluation?.evaluation.comment ?? IDLE_TICKER_TEXT`
- Side class:
  - `evaluation === null` → `styles.idle`
  - else `getMoveSide(evaluation.moveIndex) === 'white'` → `styles.whiteMove`, otherwise `styles.blackMove`
- Animation key on the `<div className={styles.track}>`: `evaluation?.moveIndex ?? 'idle'` (replaces the previous `comment?.id ?? 'idle'`).
- `getMoveSide` is exported from `model.ts` (currently a private helper there) and imported here. No duplication.

### Removed
- The local `ArbiterLiveComment` type alias.

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
...
<ArbiterToastLayer evaluation={resolvedEvaluation} />
```

The `EvalBar` continues to receive `resolvedEvaluation` but reads only the `.evaluation` field — adjust the bar's prop access accordingly (`resolvedEvaluation?.evaluation ?? null`), or change `EvalBar`'s prop to `ResolvedEvaluation | null`. The simpler change is to pass `resolvedEvaluation?.evaluation ?? null` to `EvalBar` and keep its prop signature unchanged.

## Tests

### `src/features/game/model.test.ts`
Add cases:
1. **Resolved evaluation includes `moveIndex`**: after recording two evaluations (move 0 and move 2, with move 1 null), at cursor 3 the resolved entry has `moveIndex === 2`; at cursor 2 it has `moveIndex === 0`; at cursor 0 it's `null`.
2. **Auto-request on cursor visit**: with arbiter configured, a stored game with two moves and `evaluations: [null, null]`, navigating cursor to 1 enqueues a request for `moveIndex 0`; navigating to 2 enqueues a request for `moveIndex 1`. Use a fake arbiter that captures requested move indices.
3. **Dedupe**: navigating cursor multiple times across the same missing index does not enqueue duplicates while a request is in-flight or queued. Specifically: cursor → 1 (queued), cursor → 2 (queued), cursor → 1 again should not re-add `moveIndex 0`.
4. **Apply still triggers a request via the effect**: after a successful turn the new move's evaluation is enqueued (validates that removing the explicit call from `applyResolvedMove` did not regress).

Remove (or rewrite) tests that assert against `arbiterLiveComment` / `dismissArbiterLiveComment`.

### `src/features/game/ArbiterToastLayer.test.tsx`
Update for the new prop shape:
- `evaluation === null` → idle text and idle class.
- `evaluation = { evaluation: { score, comment }, moveIndex: 0 }` → comment text rendered, white-move class.
- `evaluation.moveIndex = 1` → black-move class.
- Changing `moveIndex` re-keys the track (covered by React's keying — assert by querying for the keyed element if currently asserted).

## Out of scope
- "Evaluating now…" indicator while a request is in-flight for the cursor's current move.
- Manual re-request UI for failed evaluations.
- Bulk back-fill of all missing evaluations on game load.
- Changes to arbiter providers, queue concurrency, or evaluation persistence shape.
