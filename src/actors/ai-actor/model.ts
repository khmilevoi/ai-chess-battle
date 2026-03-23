import * as errore from 'errore'
import {
  action,
  atom,
  named,
  type Action,
  type Atom,
  type Computed,
} from '@reatom/core'
import type { ActorMove, Side } from '../../domain/chess/types'
import {
  ActorError,
  TurnCancelledError,
  type ActorRequestError,
} from '../../shared/errors'
import {
  ReatomGateAbortError,
  ReatomGateConcurrentSpawnError,
  ReatomGateMissingPendingSendError,
  reatomGate,
} from '../../shared/reatom/reatomGate'
import type { AutonomousActor } from '../types'

type BeforeRequestMoveArgs = Parameters<NonNullable<AutonomousActor['beforeRequestMove']>>[0]

export const AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS = 10

export type AiActorRequestArgs = {
  context: Parameters<AutonomousActor['requestMove']>[0]['context']
  errorStack: ReadonlyArray<ActorRequestError>
  signal: AbortSignal
}

function createConfirmationGate(name: string) {
  return reatomGate<null, { side: Side }>({ name })
}

function isTaggedError(error: Error): error is Error & { _tag: string } {
  return '_tag' in error && typeof error._tag === 'string'
}

export abstract class AiActor implements AutonomousActor {
  readonly kind = 'autonomous'
  readonly waitForConfirmation: Atom<boolean>
  readonly confirmationPending: Computed<{ params: { side: Side } } | null>
  readonly isConfirmationPending: Computed<boolean>
  readonly setWaitForConfirmation: Action<[next: boolean], null>
  readonly confirmMoveRequest: Action<[], ActorError | null>

  private readonly displayName: string
  private readonly confirmationGate: ReturnType<typeof createConfirmationGate>

  protected constructor({
    displayName,
    name = named('aiActorRuntime'),
  }: {
    displayName: string
    name?: string
  }) {
    this.displayName = displayName
    this.confirmationGate = createConfirmationGate(`${name}.confirmationGate`)
    this.waitForConfirmation = atom(false, `${name}.waitForConfirmation`)
    this.confirmationPending = this.confirmationGate.pending
    this.isConfirmationPending = this.confirmationGate.isPending
    this.setWaitForConfirmation = action((next: boolean) => {
      this.waitForConfirmation.set(next)

      if (!next && this.confirmationGate.isPending()) {
        this.confirmationGate.send(null)
      }

      return null
    }, `${name}.setWaitForConfirmation`)
    this.confirmMoveRequest = action(() => {
      if (!this.waitForConfirmation()) {
        return null
      }

      const result = this.confirmationGate.send(null)

      if (result instanceof ReatomGateMissingPendingSendError) {
        return new ActorError({
          message: `${this.displayName} does not have a pending confirmation request.`,
          cause: result,
        })
      }

      return null
    }, `${name}.confirmMoveRequest`)
  }

  protected abstract requestModelMove(args: AiActorRequestArgs): Promise<ActorMove | Error>

  protected abstract isRetryableError(error: ActorRequestError): boolean

  async beforeRequestMove({
    context,
    signal,
  }: BeforeRequestMoveArgs): Promise<ActorRequestError | null> {
    if (!this.waitForConfirmation()) {
      return null
    }

    const result = await this.confirmationGate.spawn({
      signal,
      params: { side: context.side },
    })

    if (result instanceof ReatomGateAbortError) {
      return this.toTurnCancelledError({
        side: context.side,
        reason: result,
      })
    }

    if (result instanceof ReatomGateConcurrentSpawnError) {
      return new ActorError({
        message: `${this.displayName} is already waiting for request confirmation.`,
        cause: result,
      })
    }

    return null
  }

  async requestMove({
    context,
    signal,
  }: Parameters<AutonomousActor['requestMove']>[0]): Promise<ActorMove | ActorRequestError> {
    const errorStack: ActorRequestError[] = []

    for (let attempt = 0; attempt < AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS; attempt += 1) {
      if (signal.aborted) {
        return this.toTurnCancelledError({
          side: context.side,
          reason: signal.reason,
        })
      }

      const result = this.normalizeMoveResult({
        side: context.side,
        signal,
        result: await this.requestModelMove({
          context,
          errorStack,
          signal,
        }),
      })

      if (!(result instanceof Error)) {
        return result
      }

      if (!this.isRetryableError(result)) {
        return result
      }

      errorStack.push(result)
    }

    return (
      errorStack[errorStack.length - 1] ??
      new ActorError({
        message: `${this.displayName} request failed without any attempts.`,
      })
    )
  }

  protected toTurnCancelledError({
    side,
    reason,
  }: {
    side: Side
    reason: unknown
  }): TurnCancelledError {
    if (reason instanceof TurnCancelledError) {
      return reason
    }

    return new TurnCancelledError({
      side,
      cause: reason,
    })
  }

  private isAbortRequestError({
    error,
    signal,
  }: {
    error: unknown
    signal: AbortSignal
  }) {
    return (
      signal.aborted ||
      errore.isAbortError(error) ||
      (error instanceof Error && error.name === 'AbortError')
    )
  }

  private normalizeMoveResult({
    side,
    signal,
    result,
  }: {
    side: Side
    signal: AbortSignal
    result: ActorMove | Error
  }): ActorMove | ActorRequestError {
    if (!(result instanceof Error)) {
      return result
    }

    if (this.isAbortRequestError({ error: result, signal })) {
      return this.toTurnCancelledError({
        side,
        reason: result,
      })
    }

    if (result instanceof ActorError || isTaggedError(result)) {
      return result as ActorRequestError
    }

    return new ActorError({
      message: `${this.displayName} request failed.`,
      cause: result,
    })
  }
}
