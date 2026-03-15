import * as errore from 'errore'
import { z } from 'zod'
import {
  ActorConfigError,
  IllegalMoveError,
  OpenAiHttpError,
  OpenAiResponseError,
  OpenAiTransportError,
  type ActorRequestError,
} from '../../shared/errors'
import { toUciMove, type ActorMove, type GameActor } from '../chess/types'

export const DEFAULT_OPENAI_MODEL = 'gpt-5-mini-2025-08-07'

export const openAiActorConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().min(1, 'Model is required').default(DEFAULT_OPENAI_MODEL),
})

export type OpenAiActorConfig = z.infer<typeof openAiActorConfigSchema>

const moveResponseSchema = z.object({
  from: z.string().regex(/^[a-h][1-8]$/),
  to: z.string().regex(/^[a-h][1-8]$/),
  promotion: z.enum(['q', 'r', 'b', 'n']).optional(),
})

type OpenAiResponse = {
  error?: {
    message?: string
  } | null
  output?: Array<{
    type?: string
    content?: Array<{
      type?: string
      text?: string
    }>
  }>
}

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
  ].join(' ')
}

function buildPrompt(
  context: Parameters<GameActor['requestMove']>[0]['context'],
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

function extractOutputText(payload: OpenAiResponse): string | OpenAiResponseError {
  if (payload.error) {
    return new OpenAiResponseError({
      cause: new Error(payload.error.message ?? 'OpenAI returned an API error.'),
    })
  }

  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) {
        return content.text
      }
    }
  }

  return new OpenAiResponseError({
    cause: new Error('OpenAI response did not include output_text content.'),
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
  const normalizedMove: ActorMove = {
    from: move.from,
    to: move.to,
    promotion: move.promotion,
    uci: toUciMove(move.from, move.to, move.promotion),
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

export class OpenAiActor implements GameActor {
  private readonly config: OpenAiActorConfig

  constructor(config: OpenAiActorConfig) {
    this.config = config
  }

  async requestMove({
    context,
    signal,
  }: Parameters<GameActor['requestMove']>[0]): Promise<ActorMove | ActorRequestError> {
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
    context: Parameters<GameActor['requestMove']>[0]['context']
    signal: AbortSignal
    retryMessage?: string
  }): Promise<
    ActorMove | OpenAiTransportError | OpenAiHttpError | OpenAiResponseError | IllegalMoveError
  > {
    const response: OpenAiTransportError | Response = await fetch(
      'https://api.openai.com/v1/responses',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal,
        body: JSON.stringify({
          model: this.config.model,
          store: false,
          reasoning: { effort: 'minimal' },
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
                    enum: ['q', 'r', 'b', 'n'],
                  },
                },
                required: ['from', 'to'],
                additionalProperties: false,
              },
            },
          },
        }),
      },
    ).catch(
      (cause) =>
        new OpenAiTransportError({
          operation: 'request',
          cause,
        }),
    )

    if (response instanceof OpenAiTransportError && errore.isAbortError(response)) {
      return response
    }

    if (response instanceof OpenAiTransportError) {
      return response
    }

    if (!response.ok) {
      const errorBody: OpenAiTransportError | string = await response.text().catch(
        (cause: unknown) =>
          new OpenAiTransportError({
            operation: 'error-body',
            cause,
          }),
      )

      if (errorBody instanceof OpenAiTransportError && errore.isAbortError(errorBody)) {
        return errorBody
      }

      return new OpenAiHttpError({
        status: response.status,
        cause:
          typeof errorBody === 'string'
            ? new Error(errorBody || 'HTTP error')
            : errorBody,
      })
    }

    const payload: OpenAiResponse | OpenAiResponseError = await (
      response.json() as Promise<OpenAiResponse>
    ).catch(
      (cause) => new OpenAiResponseError({ cause }),
    )

    if (payload instanceof OpenAiResponseError && errore.isAbortError(payload)) {
      return payload
    }

    if (payload instanceof OpenAiResponseError) {
      return payload
    }

    const outputText = extractOutputText(payload)

    if (outputText instanceof Error) {
      return outputText
    }

    const parsed: OpenAiResponseError | ParsedJsonValue = errore.try({
      try: () => JSON.parse(outputText) as ParsedJsonValue,
      catch: (cause) => new OpenAiResponseError({ cause }),
    })

    if (parsed instanceof OpenAiResponseError) {
      return parsed
    }

    return validateMove(parsed, context.legalMovesBySquare)
  }
}

export function createOpenAiActor(
  config: OpenAiActorConfig,
): OpenAiActor | ActorConfigError {
  const validation = openAiActorConfigSchema.safeParse(config)

  if (!validation.success) {
    return new ActorConfigError({
      side: 'unknown',
      actorKey: 'openai',
      cause: validation.error,
    })
  }

  return new OpenAiActor(validation.data)
}
