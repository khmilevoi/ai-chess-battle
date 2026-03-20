import { atom, peek, withLocalStorage } from '@reatom/core'
import { createChessEngine } from '../../domain/chess/createChessEngine'
import {
  isTerminalStatus,
  parseUciMove,
  type BoardSnapshot,
  type ChessEngineFacade,
  type UciMove,
} from '../../domain/chess/types'
import type { MatchConfig } from '../../actors/registry'
import { StorageError } from '../errors'
import { normalizeStoredMatchConfigValue } from './helpers'

const STORAGE_KEY = 'ai-chess-battle.game-session'
const STORAGE_VERSION = 'game-session@1'
const STORAGE_DATA_VERSION = 1

export type StoredGameSession = {
  version: typeof STORAGE_DATA_VERSION
  config: MatchConfig
  moves: Array<UciMove>
  updatedAt: number
}

export type StoredGameSessionSummary = {
  config: MatchConfig
  moveCount: number
  turn: BoardSnapshot['turn']
  fen: BoardSnapshot['fen']
  statusText: string
  isFinished: boolean
  updatedAt: number
}

const storedGameSession = atom<StoredGameSession | null>(
  null,
  'storage.gameSession',
).extend(
  withLocalStorage({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    fromSnapshot: (snapshot, state) => {
      const normalized = normalizeStoredGameSessionValue(snapshot)
      return normalized ?? state ?? null
    },
  }),
)

function formatStatus(snapshot: BoardSnapshot): string {
  const status = snapshot.status

  if (status.kind === 'active') {
    return `${status.turn} to move`
  }

  if (status.kind === 'check') {
    return `${status.turn} is in check`
  }

  if (status.kind === 'checkmate') {
    return `${status.winner} wins by checkmate`
  }

  if (status.kind === 'stalemate') {
    return 'Stalemate'
  }

  return `Draw: ${status.reason}`
}

function normalizeStoredGameSessionValue(
  value: unknown,
): StoredGameSession | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>

  if (record.version !== STORAGE_DATA_VERSION) {
    return null
  }

  const config = normalizeStoredMatchConfigValue(record.config)

  if (config === null) {
    return null
  }

  if (!Array.isArray(record.moves) || !record.moves.every((move) => typeof move === 'string')) {
    return null
  }

  if (typeof record.updatedAt !== 'number' || !Number.isFinite(record.updatedAt)) {
    return null
  }

  return {
    version: STORAGE_DATA_VERSION,
    config,
    moves: record.moves as Array<UciMove>,
    updatedAt: record.updatedAt,
  }
}

export function createStoredGameSession({
  config,
  moves = [],
}: {
  config: MatchConfig
  moves?: Array<UciMove>
}): StoredGameSession {
  return {
    version: STORAGE_DATA_VERSION,
    config,
    moves,
    updatedAt: Date.now(),
  }
}

export function loadStoredGameSession(): StoredGameSession | null {
  return storedGameSession()
}

export function readStoredGameSession(): StoredGameSession | null {
  return peek(storedGameSession)
}

export function saveStoredGameSession(session: StoredGameSession): void {
  const normalized = normalizeStoredGameSessionValue(session)

  if (normalized === null) {
    console.warn('Ignored invalid game session.')
    return
  }

  storedGameSession.set(normalized)
}

export function clearStoredGameSession(): void {
  storedGameSession.set(null)
}

export function replayGameSession(
  session: StoredGameSession,
): { engine: ChessEngineFacade; snapshot: BoardSnapshot } | StorageError {
  const engine = createChessEngine()

  if (engine instanceof Error) {
    return new StorageError({
      message: 'Failed to initialize the saved game session.',
      cause: engine,
    })
  }

  let snapshot = engine.getBoardSnapshot()

  for (const uci of session.moves) {
    const move = parseUciMove(uci)

    if (move === null) {
      return new StorageError({
        message: `Stored move "${uci}" is invalid.`,
      })
    }

    const nextSnapshot = engine.applyMove(move)

    if (nextSnapshot instanceof Error) {
      return new StorageError({
        message: `Failed to replay stored move "${uci}".`,
        cause: nextSnapshot,
      })
    }

    snapshot = nextSnapshot
  }

  return { engine, snapshot }
}

export function summarizeStoredGameSession(
  session: StoredGameSession,
): StoredGameSessionSummary | StorageError {
  const replayed = replayGameSession(session)

  if (replayed instanceof Error) {
    return replayed
  }

  return {
    config: session.config,
    moveCount: replayed.snapshot.history.length,
    turn: replayed.snapshot.turn,
    fen: replayed.snapshot.fen,
    statusText: formatStatus(replayed.snapshot),
    isFinished: isTerminalStatus(replayed.snapshot.status),
    updatedAt: session.updatedAt,
  }
}
