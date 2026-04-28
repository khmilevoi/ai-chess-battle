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

export type AiActorResponseDiagnostics = {
  finishReason?: string
  responseText: string
  candidatesTokenCount?: number
  thoughtsTokenCount?: number
}

export const aiActorMoveSchema = z.object({
  from: z.string().regex(/^[a-h][1-8]$/),
  to: z.string().regex(/^[a-h][1-8]$/),
  promotion: z.enum(['q', 'r', 'b', 'n', 'null']),
})

export function buildAiActorInstructions() {
  return `
You are a chess move selector.

Task:
Choose the strongest legal move for the side to move.

Rules:
- Do not choose merely any legal move.
- Before selecting a move, check whether the opponent can immediately capture the moved piece.
- Never move a rook, queen, bishop, knight, or pawn to a square where the opponent king can capture it unless this wins by force.
- Prefer moves that preserve material, give checkmate, win material, or improve the position.
  `.trim();
}

export function buildAiActorPrompt({
  context,
}: Pick<AiActorRequestArgs, 'context'>) {
  const lastMove = context.snapshot.lastMove?.uci ?? null

  return JSON.stringify({
    side: context.side,
    fen: context.snapshot.fen,
    moveCount: context.moveCount,
    lastMove,
    legalMovesBySquare: context.legalMovesBySquare,
  })
}

export function createAiActorResponseErrorCause({
  cause,
  responseDiagnostics,
}: {
  cause: unknown
  responseDiagnostics?: AiActorResponseDiagnostics
}) {
  if (!responseDiagnostics) {
    return cause
  }

  return Object.assign(
    new Error(
      `Model response diagnostics: finishReason=${responseDiagnostics.finishReason ?? 'unknown'}, candidatesTokenCount=${responseDiagnostics.candidatesTokenCount ?? 'unknown'}, thoughtsTokenCount=${responseDiagnostics.thoughtsTokenCount ?? 'unknown'}.`,
      { cause },
    ),
    responseDiagnostics,
  )
}

export function validateAiActorMove<TError extends Error>({
  parsed,
  legalMovesBySquare,
  createResponseError,
  responseDiagnostics,
}: {
  parsed: unknown
  legalMovesBySquare: Record<string, Array<string>>
  createResponseError: (cause: unknown) => TError
  responseDiagnostics?: AiActorResponseDiagnostics
}): ActorMove | IllegalMoveError | TError {
  const validation = aiActorMoveSchema.safeParse(parsed)

  if (!validation.success) {
    return createResponseError(
      createAiActorResponseErrorCause({
        cause: validation.error,
        responseDiagnostics,
      }),
    )
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
  responseDiagnostics,
}: {
  text: string
  legalMovesBySquare: Record<string, Array<string>>
  createResponseError: (cause: unknown) => TError
  responseDiagnostics?: AiActorResponseDiagnostics
}): ActorMove | IllegalMoveError | TError {
  const parsed: ParsedJsonValue | TError = errore.try({
    try: () => JSON.parse(text) as ParsedJsonValue,
    catch: (cause) =>
      createResponseError(
        createAiActorResponseErrorCause({
          cause,
          responseDiagnostics,
        }),
      ),
  })

  if (parsed instanceof Error) {
    return parsed
  }

  return validateAiActorMove({
    parsed,
    legalMovesBySquare,
    createResponseError,
    responseDiagnostics,
  })
}
