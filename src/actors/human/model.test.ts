import { describe, expect, it } from 'vitest'
import type { ActorContext, ActorMove, Side } from '../../domain/chess/types'
import { ActorError, TurnCancelledError } from '../../shared/errors'
import { HumanActorRuntime } from './model'

let humanActorId = 0

function createContext(side: Side): ActorContext {
  return {
    side,
    snapshot: {
      fen: 'test-fen',
      turn: side,
      pieces: [],
      status: { kind: 'active', turn: side },
      lastMove: null,
      history: [],
    },
    legalMovesBySquare: {},
    moveCount: 0,
  }
}

const move: ActorMove = {
  from: 'e2',
  to: 'e4',
  uci: 'e2e4',
}

describe('HumanActorRuntime', () => {
  it('resolves a pending move request through submitMove', async () => {
    const actor = new HumanActorRuntime(`testHuman#${++humanActorId}`)
    const pendingMove = actor.requestMove({
      context: createContext('white'),
      signal: new AbortController().signal,
    })

    expect(actor.submitMove(move)).toBeNull()
    expect(await pendingMove).toEqual(move)
  })

  it('returns cancellation on abort and rejects stale submitMove calls', async () => {
    const actor = new HumanActorRuntime(`testHuman#${++humanActorId}`)
    const controller = new AbortController()
    const pendingMove = actor.requestMove({
      context: createContext('white'),
      signal: controller.signal,
    })

    controller.abort(new TurnCancelledError({ side: 'white' }))

    const result = await pendingMove
    expect(result).toBeInstanceOf(TurnCancelledError)

    const lateMoveResult = actor.submitMove(move)
    expect(lateMoveResult).toBeInstanceOf(ActorError)
  })
})
