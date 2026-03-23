import * as errore from 'errore'
import { z } from 'zod'
import { IllegalMoveError } from '@/shared/errors'
import { toUciMove, type ActorMove } from '@/domain/chess/types'
import type { AiActorRequestArgs } from './model'

type ParsedJsonValue =
  | null
  | boolean
  | number
  | string
  | Array<unknown>
  | Record<string, unknown>

export const AI_ACTOR_MAX_OUTPUT_TOKENS = 128

export const aiActorMoveSchema = z.object({
  from: z.string().regex(/^[a-h][1-8]$/),
  to: z.string().regex(/^[a-h][1-8]$/),
  promotion: z.enum(['q', 'r', 'b', 'n', 'null']),
})

export const AI_ACTOR_MOVE_JSON_SCHEMA = {
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
} as const

export function buildAiActorInstructions() {
  return [
    'You are an assistant that selects chess moves.',
    'Respond with JSON only.',
    'Choose exactly one legal move for the side to move.',
    'Never explain the move.',
    'Always include promotion.',
    'Use promotion="null" when the move is not a promotion.',
  ].join(' ')
}

export function buildAiActorPrompt({
  context,
  errorStack,
}: Pick<AiActorRequestArgs, 'context' | 'errorStack'>) {
  const lastMove = context.snapshot.lastMove?.uci ?? null

  return JSON.stringify({
    side: context.side,
    fen: context.snapshot.fen,
    moveCount: context.moveCount,
    lastMove,
    legalMovesBySquare: context.legalMovesBySquare,
    errorStack: errorStack.map((error, index) => ({
      index: index + 1,
      name: error.name,
      message: error.message,
    })),
  })
}

export function validateAiActorMove<TError extends Error>({
  parsed,
  legalMovesBySquare,
  createResponseError,
}: {
  parsed: unknown
  legalMovesBySquare: Record<string, Array<string>>
  createResponseError: (cause: unknown) => TError
}): ActorMove | IllegalMoveError | TError {
  const validation = aiActorMoveSchema.safeParse(parsed)

  if (!validation.success) {
    return createResponseError(validation.error)
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

export function parseAiActorMoveJson<TError extends Error>({
  text,
  legalMovesBySquare,
  createResponseError,
}: {
  text: string
  legalMovesBySquare: Record<string, Array<string>>
  createResponseError: (cause: unknown) => TError
}): ActorMove | IllegalMoveError | TError {
  const parsed: ParsedJsonValue | TError = errore.try({
    try: () => JSON.parse(text) as ParsedJsonValue,
    catch: (cause) => createResponseError(cause),
  })

  if (parsed instanceof Error) {
    return parsed
  }

  return validateAiActorMove({
    parsed,
    legalMovesBySquare,
    createResponseError,
  })
}
