import {
  ActorError,
  TurnCancelledError,
} from '../../shared/errors'
import type { ActorMove, Side } from '../../domain/chess/types'
import { named } from '@reatom/core'
import {
  ReatomGateAbortError,
  ReatomGateConcurrentSpawnError,
  ReatomGateMissingPendingSendError,
  reatomGate,
} from '../../shared/reatom/reatomGate'
import type { InteractiveActor } from '../types'

function toTurnCancelledError(
  side: Parameters<InteractiveActor['requestMove']>[0]['context']['side'],
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

function createMoveGate(name: string) {
  return reatomGate<ActorMove, { side: Side }>({ name })
}

export class HumanActorRuntime implements InteractiveActor {
  readonly kind = 'interactive'

  private readonly moveGate: ReturnType<typeof createMoveGate>

  constructor(name: string = named('humanActorRuntime')) {
    this.moveGate = createMoveGate(`${name}.moveGate`)
  }

  async requestMove({
    context,
    signal,
  }: Parameters<InteractiveActor['requestMove']>[0]) {
    const result = await this.moveGate.spawn({
      signal,
      params: { side: context.side },
    })

    if (result instanceof ReatomGateAbortError) {
      return toTurnCancelledError(context.side, result)
    }

    if (result instanceof ReatomGateConcurrentSpawnError) {
      return new ActorError({
        message: 'Human actor is already waiting for a move.',
        cause: result,
      })
    }

    return result
  }

  submitMove(move: ActorMove): ActorError | null {
    const result = this.moveGate.send(move)

    if (result instanceof ReatomGateMissingPendingSendError) {
      return new ActorError({
        message: 'Human actor does not have a pending move request.',
        cause: result,
      })
    }

    return null
  }
}
