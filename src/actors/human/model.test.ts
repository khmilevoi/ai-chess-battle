import { describe, expect, it } from 'vitest'
import { named } from '@reatom/core'
import type { ActorContext, ActorMove, Side } from '@/domain/chess/types'
import { ActorError, TurnCancelledError } from '@/shared/errors'
import { HumanActorRuntime } from './model'

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
    const actor = new HumanActorRuntime(named('testHuman'))
    const pendingMove = actor.requestMove({
      context: createContext('white'),
      signal: new AbortController().signal,
    })

    expect(actor.submitMove(move)).toBeNull()
    expect(await pendingMove).toEqual(move)
  })

  it('returns cancellation on abort and rejects stale submitMove calls', async () => {
    const actor = new HumanActorRuntime(named('testHuman'))
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

  it('maps concurrent requestMove calls to ActorError without breaking the first waiter', async () => {
    const actor = new HumanActorRuntime(named('testHuman'))
    const firstMove = actor.requestMove({
      context: createContext('white'),
      signal: new AbortController().signal,
    })
    const secondMove = await actor.requestMove({
      context: createContext('white'),
      signal: new AbortController().signal,
    })

    expect(secondMove).toBeInstanceOf(ActorError)

    if (secondMove instanceof ActorError) {
      expect(secondMove.message).toBe('Human actor is already waiting for a move.')
    }

    expect(actor.submitMove(move)).toBeNull()
    expect(await firstMove).toEqual(move)
  })
})
