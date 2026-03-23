import * as errore from 'errore'
import OpenAI, { APIError, APIUserAbortError } from 'openai'
import {
  action,
  atom,
  named,
  type Action,
  type Atom,
  type Computed,
} from '@reatom/core'
import { z } from 'zod'
import {
  ActorError,
  IllegalMoveError,
  OpenAiHttpError,
  OpenAiResponseError,
  OpenAiTransportError,
  TurnCancelledError,
  type ActorRequestError,
} from '../../shared/errors'
import { toUciMove, type ActorMove, type Side } from '../../domain/chess/types'
import {
  ReatomGateAbortError,
  ReatomGateConcurrentSpawnError,
  ReatomGateMissingPendingSendError,
  reatomGate,
} from '../../shared/reatom/reatomGate'
import type { AutonomousActor } from '../types'
import type { OpenAiActorConfig } from './config.schema'

const moveResponseSchema = z.object({
  from: z.string().regex(/^[a-h][1-8]$/),
  to: z.string().regex(/^[a-h][1-8]$/),
  promotion: z.enum(['q', 'r', 'b', 'n', 'null']),
})

type ParsedJsonValue =
  | null
  | boolean
  | number
  | string
  | Array<unknown>
  | Record<string, unknown>

function buildInstructions() {
  return [
    'You are an assistant that selects chess moves.',
    'Respond with JSON only.',
    'Choose exactly one legal move for the side to move.',
    'Never explain the move.',
    'Always include promotion.',
    'Use promotion="null" when the move is not a promotion.',
  ].join(' ')
}

function buildPrompt(
  context: Parameters<AutonomousActor['requestMove']>[0]['context'],
  retryMessage?: string,
) {
  const lastMove = context.snapshot.lastMove?.uci ?? null

  return JSON.stringify({
    side: context.side,
    fen: context.snapshot.fen,
    moveCount: context.moveCount,
    lastMove,
    legalMovesBySquare: context.legalMovesBySquare,
    retryMessage: retryMessage ?? null,
  })
}

function validateMove(
  parsed: unknown,
  legalMovesBySquare: Record<string, Array<string>>,
): ActorMove | OpenAiResponseError | IllegalMoveError {
  const validation = moveResponseSchema.safeParse(parsed)

  if (!validation.success) {
    return new OpenAiResponseError({ cause: validation.error })
  }

  const move = validation.data
  const promotion = move.promotion === 'null' ? undefined : move.promotion

  const normalizedMove: ActorMove = {
    from: move.from,
    to: move.to,
    promotion,
    uci: toUciMove(move.from, move.to, promotion),
  }

  const legalTargets = legalMovesBySquare[normalizedMove.from] ?? []

  if (!legalTargets.includes(normalizedMove.to)) {
    return new IllegalMoveError({
      uci: normalizedMove.uci,
      cause: new Error('Move is not legal in the provided context.'),
    })
  }

  return normalizedMove
}

function isAbortRequestError(error: unknown, signal: AbortSignal) {
  return (
    signal.aborted ||
    errore.isAbortError(error) ||
    error instanceof APIUserAbortError ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

function toTurnCancelledError(
  side: Side,
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

function createConfirmationGate(name: string) {
  return reatomGate<null, { side: Side }>({ name })
}

export class OpenAiActorRuntime implements AutonomousActor {
  readonly kind = 'autonomous'
  readonly waitForConfirmation: Atom<boolean>
  readonly confirmationPending: Computed<{ params: { side: Side } } | null>
  readonly isConfirmationPending: Computed<boolean>
  readonly setWaitForConfirmation: Action<[next: boolean], null>
  readonly confirmMoveRequest: Action<[], ActorError | null>

  private readonly config: OpenAiActorConfig
  private readonly client: OpenAI
  private readonly confirmationGate: ReturnType<typeof createConfirmationGate>

  constructor(
    config: OpenAiActorConfig,
    name: string = named('openAiActorRuntime'),
  ) {
    this.config = config
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: 'https://api.openai.com/v1',
      dangerouslyAllowBrowser: true,
    })
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
          message: 'OpenAI actor does not have a pending confirmation request.',
          cause: result,
        })
      }

      return null
    }, `${name}.confirmMoveRequest`)
  }

  async beforeRequestMove({
    context,
    signal,
  }: Parameters<AutonomousActor['requestMove']>[0]): Promise<ActorRequestError | null> {
    if (!this.waitForConfirmation()) {
      return null
    }

    const result = await this.confirmationGate.spawn({
      signal,
      params: { side: context.side },
    })

    if (result instanceof ReatomGateAbortError) {
      return toTurnCancelledError(context.side, result)
    }

    if (result instanceof ReatomGateConcurrentSpawnError) {
      return new ActorError({
        message: 'OpenAI actor is already waiting for request confirmation.',
        cause: result,
      })
    }

    return null
  }

  async requestMove({
    context,
    signal,
  }: Parameters<AutonomousActor['requestMove']>[0]): Promise<
    ActorMove | ActorRequestError
  > {
    const firstAttempt = await this.requestMoveOnce({ context, signal })

    if (firstAttempt instanceof Error && errore.isAbortError(firstAttempt)) {
      return firstAttempt
    }

    if (!(firstAttempt instanceof Error)) {
      return firstAttempt
    }

    if (
      !(firstAttempt instanceof OpenAiResponseError) &&
      !(firstAttempt instanceof IllegalMoveError)
    ) {
      return firstAttempt
    }

    return await this.requestMoveOnce({
      context,
      signal,
      retryMessage: `Previous response failed: ${firstAttempt.message}`,
    })
  }

  private async requestMoveOnce({
    context,
    signal,
    retryMessage,
  }: {
    context: Parameters<AutonomousActor['requestMove']>[0]['context']
    signal: AbortSignal
    retryMessage?: string
  }): Promise<
    | ActorMove
    | OpenAiTransportError
    | OpenAiHttpError
    | OpenAiResponseError
    | IllegalMoveError
    | TurnCancelledError
  > {
    const response = await this.client.responses
      .create(
        {
          model: this.config.model,
          store: false,
          reasoning: { effort: this.config.reasoningEffort },
          instructions: buildInstructions(),
          input: buildPrompt(context, retryMessage),
          text: {
            format: {
              type: 'json_schema',
              name: 'chess_move',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  from: { type: 'string' },
                  to: { type: 'string' },
                  promotion: {
                    type: 'string',
                    enum: ['q', 'r', 'b', 'n', 'null'],
                  },
                },
                required: ['from', 'to', 'promotion'],
                additionalProperties: false,
              },
            },
          },
        },
        { signal },
      )
      .catch((cause) => cause as Error)

    if (isAbortRequestError(response, signal)) {
      return new TurnCancelledError({
        side: context.side,
        cause: response instanceof Error ? response : undefined,
      })
    }

    if (response instanceof APIError && response.status !== undefined) {
      return new OpenAiHttpError({
        status: response.status,
        cause: response,
      })
    }

    if (response instanceof Error) {
      return new OpenAiTransportError({
        operation: 'request',
        cause: response,
      })
    }

    if (response.error) {
      return new OpenAiTransportError({
        operation: 'error-body',
        cause: response.error,
      })
    }

    if (response.output_text.length === 0) {
      return new OpenAiResponseError({
        cause: new Error('OpenAI response did not contain output text.'),
      })
    }

    const parsed: OpenAiResponseError | ParsedJsonValue = errore.try({
      try: () => JSON.parse(response.output_text) as ParsedJsonValue,
      catch: (cause) => new OpenAiResponseError({ cause }),
    })

    if (parsed instanceof OpenAiResponseError) {
      return parsed
    }

    return validateMove(parsed, context.legalMovesBySquare)
  }
}
