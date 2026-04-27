import { arbiterEvaluationSchema } from './schema'
import {
  DEFAULT_ARBITER_PERSONALITY_KEY,
  getArbiterPersonality,
  type ArbiterPersonalityKey,
} from './personalities'
import type { Eval } from './types'
import type { BoardSnapshot } from '@/domain/chess/types'

const ARBITER_JSON_CONTRACT =
  'After each move you receive a position and the move just played. Respond with strict JSON: { "score": <integer centipawns, positive favors white, negative favors black, clamped to [-1000, 1000]>, "comment": <one commentary sentence under 240 characters> }.'

export function buildArbiterInstructions(
  personalityKey: ArbiterPersonalityKey = DEFAULT_ARBITER_PERSONALITY_KEY,
) {
  const personality = getArbiterPersonality(personalityKey)

  return `${personality.instructions} ${ARBITER_JSON_CONTRACT}`
}

function getLastMoveSide(moveCount: number): BoardSnapshot['turn'] {
  return moveCount % 2 === 1 ? 'white' : 'black'
}

export function buildArbiterPrompt({
  snapshot,
}: {
  snapshot: Pick<BoardSnapshot, 'fen' | 'history' | 'lastMove'>
}) {
  const moveNumber = snapshot.history.length

  return JSON.stringify({
    fen: snapshot.fen,
    lastMove:
      snapshot.lastMove === null
        ? null
        : {
            uci: snapshot.lastMove.uci,
            side: getLastMoveSide(moveNumber),
          },
    moveNumber,
    recentHistory: snapshot.history.slice(-10),
  })
}

export function parseArbiterResponseJson(text: string): Eval {
  const parsed = JSON.parse(text) as unknown
  return arbiterEvaluationSchema.parse(parsed)
}
