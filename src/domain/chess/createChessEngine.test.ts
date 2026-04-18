import { describe, expect, it } from 'vitest'
import { IllegalMoveError } from '@/shared/errors'
import { createChessEngine } from './createChessEngine'
import { parseUciMove, toUciMove, type ActorMove } from './types'

function expectEngine() {
  const engine = createChessEngine()

  if (engine instanceof Error) {
    throw engine
  }

  return engine
}

function applyMoveOrThrow(engine: ReturnType<typeof expectEngine>, move: ActorMove) {
  const result = engine.applyMove(move)

  if (result instanceof Error) {
    throw result
  }

  return result
}

function parseMoveOrThrow(uci: string) {
  const move = parseUciMove(uci)

  if (move === null) {
    throw new Error(`Invalid test move: ${uci}`)
  }

  return move
}

describe('createChessEngine', () => {
  it('exposes legal opening moves and updates snapshot after a move', () => {
    const engine = expectEngine()

    expect(engine.getMovablePieces('white')).toEqual(
      expect.arrayContaining(['a2', 'b1', 'e2', 'g1']),
    )
    expect(engine.getLegalMoves('e2')).toEqual(expect.arrayContaining(['e3', 'e4']))

    const next = engine.applyMove({
      from: 'e2',
      to: 'e4',
      uci: 'e2e4',
    })

    expect(next).not.toBeInstanceOf(Error)
    if (next instanceof Error) {
      throw next
    }

    expect(next.turn).toBe('black')
    expect(next.history).toEqual(['e2e4'])
    expect(next.lastMove?.uci).toBe('e2e4')
    expect(engine.getFen()).toBe(next.fen)
  })

  it('returns illegal moves as values', () => {
    const engine = expectEngine()
    const result = engine.applyMove({
      from: 'e2',
      to: 'e5',
      uci: 'e2e5',
    })

    expect(result).toBeInstanceOf(IllegalMoveError)
  })

  it('applies a batch of moves and returns the same final snapshot as sequential moves', () => {
    const batchEngine = expectEngine()
    const sequentialEngine = expectEngine()
    const moves = ['e2e4', 'e7e5', 'g1f3'].map(parseMoveOrThrow)

    const batchSnapshot = batchEngine.applyMoves(moves)
    const sequentialSnapshot = moves.reduce((snapshot, move) => {
      expect(snapshot).not.toBeInstanceOf(Error)

      if (snapshot instanceof Error) {
        throw snapshot
      }

      return sequentialEngine.applyMove(move)
    }, sequentialEngine.getBoardSnapshot() as ReturnType<typeof sequentialEngine.applyMove>)

    expect(batchSnapshot).not.toBeInstanceOf(Error)
    expect(sequentialSnapshot).not.toBeInstanceOf(Error)

    if (batchSnapshot instanceof Error) {
      throw batchSnapshot
    }

    if (sequentialSnapshot instanceof Error) {
      throw sequentialSnapshot
    }

    expect(batchSnapshot).toEqual(sequentialSnapshot)
    expect(batchSnapshot.history).toEqual(['e2e4', 'e7e5', 'g1f3'])
  })

  it('returns the illegal move error from batch application', () => {
    const engine = expectEngine()
    const result = engine.applyMoves([
      {
        from: 'e2',
        to: 'e5',
        uci: 'e2e5',
      },
    ])

    expect(result).toBeInstanceOf(IllegalMoveError)
  })

  it('maps checkmate state from the engine', () => {
    const engine = expectEngine()

    applyMoveOrThrow(engine, {
      from: 'f2',
      to: 'f3',
      uci: 'f2f3',
    })
    applyMoveOrThrow(engine, {
      from: 'e7',
      to: 'e5',
      uci: 'e7e5',
    })
    applyMoveOrThrow(engine, {
      from: 'g2',
      to: 'g4',
      uci: 'g2g4',
    })
    const mate = applyMoveOrThrow(engine, {
      from: 'd8',
      to: 'h4',
      uci: 'd8h4',
    })

    expect(mate.status).toEqual({
      kind: 'checkmate',
      winner: 'black',
    })
  })

  it('keeps promotion moves normalized as uci', () => {
    const engine = createChessEngine('7k/P7/8/8/8/8/8/7K w - - 0 1')

    if (engine instanceof Error) {
      throw engine
    }

    const promoted = engine.applyMove({
      from: 'a7',
      to: 'a8',
      promotion: 'q',
      uci: toUciMove('a7', 'a8', 'q'),
    })

    expect(promoted).not.toBeInstanceOf(Error)
    if (promoted instanceof Error) {
      throw promoted
    }

    expect(promoted.history).toEqual(['a7a8q'])
    expect(promoted.lastMove?.promotion).toBe('q')
  })
})
