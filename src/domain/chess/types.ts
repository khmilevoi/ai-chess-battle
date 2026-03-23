import type {
  ActorRequestError,
  EngineFailure,
} from '../../shared/errors'

export type Side = 'white' | 'black'
export type Square = string
export type FenString = string
export type UciMove = string
export type PromotionPiece = 'q' | 'r' | 'b' | 'n'

export type PieceType =
  | 'pawn'
  | 'knight'
  | 'bishop'
  | 'rook'
  | 'queen'
  | 'king'

export type PieceSnapshot = {
  id: string
  side: Side
  type: PieceType
  square: Square
}

export type ActorMove = {
  from: Square
  to: Square
  promotion?: PromotionPiece
  uci: UciMove
}

export type GameStatus =
  | { kind: 'active'; turn: Side }
  | { kind: 'check'; turn: Side }
  | { kind: 'checkmate'; winner: Side }
  | { kind: 'stalemate' }
  | { kind: 'draw'; reason: string }

export type BoardSnapshot = {
  fen: FenString
  turn: Side
  pieces: Array<PieceSnapshot>
  status: GameStatus
  lastMove: ActorMove | null
  history: Array<UciMove>
}

export type ActorContext = {
  side: Side
  snapshot: BoardSnapshot
  legalMovesBySquare: Record<Square, Array<Square>>
  moveCount: number
  metadata?: Record<string, unknown>
}

export interface ChessEngineFacade {
  getFen(): FenString
  getBoardSnapshot(): BoardSnapshot
  getMovablePieces(side: Side): Array<Square>
  getLegalMoves(square: Square): Array<Square>
  applyMove(move: ActorMove): BoardSnapshot | EngineFailure
  getGameStatus(): GameStatus
}

export interface GameActor {
  beforeRequestMove?(args: {
    context: ActorContext
    signal: AbortSignal
  }): Promise<ActorRequestError | null>
  requestMove(args: {
    context: ActorContext
    signal: AbortSignal
  }): Promise<ActorMove | ActorRequestError>
}

export function isTerminalStatus(status: GameStatus): boolean {
  return (
    status.kind === 'checkmate' ||
    status.kind === 'stalemate' ||
    status.kind === 'draw'
  )
}

export function toUciMove(
  from: Square,
  to: Square,
  promotion?: PromotionPiece,
): UciMove {
  return `${from}${to}${promotion ?? ''}`
}

export function parseUciMove(uci: UciMove): ActorMove | null {
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci)

  if (!match) {
    return null
  }

  const [, from, to, promotion] = match

  return {
    from,
    to,
    promotion: promotion as PromotionPiece | undefined,
    uci,
  }
}

export function oppositeSide(side: Side): Side {
  return side === 'white' ? 'black' : 'white'
}
