import {
  ActorError,
  TurnCancelledError,
  type ActorRequestError,
} from '../../shared/errors'
import type { ActorMove, Side } from '../../domain/chess/types'
import { reatomGate } from '../../shared/reatom/reatomGate'
import type { InteractiveActor } from '../types'

let humanActorRuntimeId = 0

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
  return reatomGate<ActorMove | ActorRequestError, { side: Side }, ActorError>({
    name,
    mapAbort: ({ params, reason }) => toTurnCancelledError(params.side, reason),
    mapConcurrentSpawn: () =>
      new ActorError({
        message: 'Human actor is already waiting for a move.',
      }),
    mapMissingPendingSend: () =>
      new ActorError({
        message: 'Human actor does not have a pending move request.',
      }),
  })
}

export class HumanActorRuntime implements InteractiveActor {
  readonly kind = 'interactive'

  private readonly moveGate: ReturnType<typeof createMoveGate>

  constructor(name = `humanActorRuntime#${++humanActorRuntimeId}`) {
    this.moveGate = createMoveGate(`${name}.moveGate`)
  }

  async requestMove({
    context,
    signal,
  }: Parameters<InteractiveActor['requestMove']>[0]) {
    return await this.moveGate.spawn({
      signal,
      params: { side: context.side },
    })
  }

  submitMove(move: ActorMove): ActorError | null {
    return this.moveGate.send(move)
  }
}
