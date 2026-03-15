import * as errore from 'errore'
import {
  Chess,
  DEFAULT_POSITION,
  SQUARES,
  type Color,
  type Move,
  type PieceSymbol,
  type Square as ChessSquare,
} from 'chess.js'
import { EngineError, IllegalMoveError } from '../../shared/errors'
import {
  oppositeSide,
  toUciMove,
  type ActorMove,
  type BoardSnapshot,
  type ChessEngineFacade,
  type GameStatus,
  type PieceSnapshot,
  type PieceType,
  type Side,
  type Square,
} from './types'

const PIECE_TYPE_MAP: Record<PieceSymbol, PieceType> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

function toSide(color: Color): Side {
  return color === 'w' ? 'white' : 'black'
}

function toChessSquare(square: Square): ChessSquare | null {
  return (SQUARES as Array<string>).includes(square)
    ? (square as ChessSquare)
    : null
}

function moveToActorMove(move: Move): ActorMove {
  const promotion =
    move.promotion === undefined
      ? undefined
      : (move.promotion as ActorMove['promotion'])

  return {
    from: move.from,
    to: move.to,
    promotion,
    uci: toUciMove(move.from, move.to, promotion),
  }
}

function readStatus(chess: Chess): GameStatus {
  const turn = toSide(chess.turn())

  if (chess.isCheckmate()) {
    return { kind: 'checkmate', winner: oppositeSide(turn) }
  }

  if (chess.isStalemate()) {
    return { kind: 'stalemate' }
  }

  if (chess.isInsufficientMaterial()) {
    return { kind: 'draw', reason: 'insufficient-material' }
  }

  if (chess.isThreefoldRepetition()) {
    return { kind: 'draw', reason: 'threefold-repetition' }
  }

  if (chess.isDrawByFiftyMoves()) {
    return { kind: 'draw', reason: 'fifty-move-rule' }
  }

  if (chess.isDraw()) {
    return { kind: 'draw', reason: 'draw' }
  }

  if (chess.isCheck()) {
    return { kind: 'check', turn }
  }

  return { kind: 'active', turn }
}

function snapshotPieces(chess: Chess): Array<PieceSnapshot> {
  const pieces: Array<PieceSnapshot> = []

  for (const rank of chess.board()) {
    for (const piece of rank) {
      if (!piece) continue

      const side = toSide(piece.color)
      const type = PIECE_TYPE_MAP[piece.type]

      pieces.push({
        id: `${side}-${type}-${piece.square}`,
        side,
        type,
        square: piece.square,
      })
    }
  }

  return pieces
}

function historyToUci(chess: Chess): Array<string> {
  return chess.history({ verbose: true }).map((move) => moveToActorMove(move).uci)
}

function createSnapshot(chess: Chess): BoardSnapshot {
  const history = chess.history({ verbose: true })
  const lastMove = history.length === 0 ? null : moveToActorMove(history.at(-1)!)

  return {
    fen: chess.fen(),
    turn: toSide(chess.turn()),
    pieces: snapshotPieces(chess),
    status: readStatus(chess),
    lastMove,
    history: historyToUci(chess),
  }
}

export function createChessEngine(
  initialFen: string = DEFAULT_POSITION,
): ChessEngineFacade | EngineError {
  const chess = errore.try({
    try: () => new Chess(initialFen),
    catch: (cause) =>
      new EngineError({
        message: 'Failed to initialize the chess engine.',
        cause,
      }),
  })

  if (chess instanceof Error) {
    return chess
  }

  return {
    getFen() {
      return chess.fen()
    },
    getBoardSnapshot() {
      return createSnapshot(chess)
    },
    getMovablePieces(side) {
      if (side !== toSide(chess.turn())) {
        return []
      }

      const squares = new Set<Square>()

      for (const move of chess.moves({ verbose: true })) {
        squares.add(move.from)
      }

      return Array.from(squares)
    },
    getLegalMoves(square) {
      const chessSquare = toChessSquare(square)

      if (!chessSquare) {
        return []
      }

      return chess
        .moves({ square: chessSquare, verbose: true })
        .map((move) => move.to)
    },
    applyMove(move) {
      const result = errore.try({
        try: () =>
          chess.move(
            {
              from: move.from,
              to: move.to,
              promotion: move.promotion,
            },
            { strict: true },
          ),
        catch: (cause) =>
          new IllegalMoveError({
            uci: move.uci,
            cause,
          }),
      })

      if (result instanceof Error) {
        return result
      }

      return createSnapshot(chess)
    },
    getGameStatus() {
      return readStatus(chess)
    },
  }
}

export const STARTING_FEN = DEFAULT_POSITION
