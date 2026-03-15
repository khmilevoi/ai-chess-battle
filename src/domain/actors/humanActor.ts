import {
  ActorError,
  TurnCancelledError,
  type ActorRequestError,
} from '../../shared/errors'
import type { ActorMove, GameActor } from '../chess/types'

type PendingMoveRequest = {
  resolve: (result: ActorMove | ActorRequestError) => void
  cleanup: () => void
}

function toTurnCancelledError(
  side: Parameters<GameActor['requestMove']>[0]['context']['side'],
  reason: unknown,
): TurnCancelledError {
  if (reason instanceof TurnCancelledError) {
    return reason
  }

  return new TurnCancelledError({
    side,
    cause: reason,
  })
}

export class HumanActor implements GameActor {
  private pending: PendingMoveRequest | null = null

  async requestMove({
    context,
    signal,
  }: Parameters<GameActor['requestMove']>[0]) {
    if (this.pending) {
      return new ActorError({
        message: 'Human actor is already waiting for a move.',
      })
    }

    if (signal.aborted) {
      return toTurnCancelledError(context.side, signal.reason)
    }

    return await new Promise<ActorMove | ActorRequestError>((resolve) => {
      const onAbort = () => {
        cleanup()
        resolve(toTurnCancelledError(context.side, signal.reason))
      }

      const cleanup = () => {
        signal.removeEventListener('abort', onAbort)
        this.pending = null
      }

      signal.addEventListener('abort', onAbort, { once: true })
      this.pending = { resolve, cleanup }
    })
  }

  submitMove(move: ActorMove): ActorError | null {
    if (!this.pending) {
      return new ActorError({
        message: 'Human actor does not have a pending move request.',
      })
    }

    const pending = this.pending
    pending.cleanup()
    pending.resolve(move)
    return null
  }
}
