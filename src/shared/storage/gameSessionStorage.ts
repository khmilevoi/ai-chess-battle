import { atom, computed, peek, withLocalStorage } from '@reatom/core'
import type { MatchConfig } from '../../actors/registry'
import { createChessEngine } from '../../domain/chess/createChessEngine'
import {
  isTerminalStatus,
  parseUciMove,
  type BoardSnapshot,
  type ChessEngineFacade,
  type UciMove,
} from '../../domain/chess/types'
import { StorageError } from '../errors'
import { normalizeStoredMatchConfigValue } from './helpers'

const STORAGE_KEY = 'ai-chess-battle.games'
const LEGACY_STORAGE_KEY = 'ai-chess-battle.game-session'
const STORAGE_VERSION = 'games@1'
const LEGACY_STORAGE_VERSION = 'game-session@1'
const STORAGE_DATA_VERSION = 1

export type StoredGameRecord = {
  id: string
  version: typeof STORAGE_DATA_VERSION
  config: MatchConfig
  moves: Array<UciMove>
  createdAt: number
  updatedAt: number
}

type StoredGameArchive = {
  version: typeof STORAGE_DATA_VERSION
  activeGameId: string | null
  games: Array<StoredGameRecord>
}

type LegacyStoredGameSession = {
  version: typeof STORAGE_DATA_VERSION
  config: MatchConfig
  moves: Array<UciMove>
  updatedAt: number
}

export type StoredGameSummary = {
  id: string
  config: MatchConfig
  moveCount: number
  turn: BoardSnapshot['turn']
  fen: BoardSnapshot['fen']
  statusText: string
  isFinished: boolean
  createdAt: number
  updatedAt: number
}

function createEmptyArchive(): StoredGameArchive {
  return {
    version: STORAGE_DATA_VERSION,
    activeGameId: null,
    games: [],
  }
}

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

function normalizeStoredGameRecordValue(value: unknown): StoredGameRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>

  if (record.version !== STORAGE_DATA_VERSION) {
    return null
  }

  if (typeof record.id !== 'string' || record.id.length === 0) {
    return null
  }

  const config = normalizeStoredMatchConfigValue(record.config)

  if (config === null) {
    return null
  }

  if (
    !Array.isArray(record.moves) ||
    !record.moves.every((move) => typeof move === 'string')
  ) {
    return null
  }

  if (
    typeof record.createdAt !== 'number' ||
    !Number.isFinite(record.createdAt) ||
    typeof record.updatedAt !== 'number' ||
    !Number.isFinite(record.updatedAt)
  ) {
    return null
  }

  return {
    id: record.id,
    version: STORAGE_DATA_VERSION,
    config,
    moves: record.moves as Array<UciMove>,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function normalizeLegacyStoredGameSessionValue(
  value: unknown,
): LegacyStoredGameSession | null {
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

  if (
    !Array.isArray(record.moves) ||
    !record.moves.every((move) => typeof move === 'string')
  ) {
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

function normalizeStoredGameArchiveValue(value: unknown): StoredGameArchive | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>

  if (record.version !== STORAGE_DATA_VERSION) {
    return null
  }

  if (!Array.isArray(record.games)) {
    return null
  }

  const games = record.games
    .map((entry) => normalizeStoredGameRecordValue(entry))
    .filter((entry): entry is StoredGameRecord => entry !== null)

  if (games.length !== record.games.length) {
    return null
  }

  const activeGameId =
    typeof record.activeGameId === 'string' ? record.activeGameId : null

  return {
    version: STORAGE_DATA_VERSION,
    activeGameId: games.some((game) => game.id === activeGameId)
      ? activeGameId
      : null,
    games,
  }
}

function getPersistSnapshotValue(persist: unknown): unknown {
  if (typeof persist === 'object' && persist !== null && 'data' in persist) {
    return (persist as { data: unknown }).data
  }

  return persist
}

function createMigratedArchive(
  legacySession: LegacyStoredGameSession,
): StoredGameArchive {
  const migratedRecord: StoredGameRecord = {
    id: crypto.randomUUID(),
    version: STORAGE_DATA_VERSION,
    config: legacySession.config,
    moves: legacySession.moves,
    createdAt: legacySession.updatedAt,
    updatedAt: legacySession.updatedAt,
  }
  const summary = summarizeStoredGameRecord(migratedRecord)

  return {
    version: STORAGE_DATA_VERSION,
    activeGameId:
      summary instanceof Error || summary.isFinished ? null : migratedRecord.id,
    games: [migratedRecord],
  }
}

export const storedGameArchiveAtom = atom<StoredGameArchive>(
  createEmptyArchive(),
  'storage.gameArchive',
).extend(
  withLocalStorage({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    migration: (persist) => {
      return (
        normalizeStoredGameArchiveValue(getPersistSnapshotValue(persist)) ??
        createEmptyArchive()
      )
    },
    fromSnapshot: (snapshot, state) => {
      const normalized = normalizeStoredGameArchiveValue(snapshot)
      return normalized ?? state ?? createEmptyArchive()
    },
  }),
)

const legacyStoredGameSessionAtom = atom<LegacyStoredGameSession | null>(
  null,
  'storage.legacyGameSession',
).extend(
  withLocalStorage({
    key: LEGACY_STORAGE_KEY,
    version: LEGACY_STORAGE_VERSION,
    migration: (persist) => {
      return normalizeLegacyStoredGameSessionValue(getPersistSnapshotValue(persist))
    },
    fromSnapshot: (snapshot, state) => {
      const normalized = normalizeLegacyStoredGameSessionValue(snapshot)
      return normalized ?? state ?? null
    },
  }),
)

function migrateLegacyStoredGameSession(): void {
  const archive = storedGameArchiveAtom()
  const legacySession = legacyStoredGameSessionAtom()

  if (legacySession === null) {
    return
  }

  if (archive.games.length > 0) {
    legacyStoredGameSessionAtom.set(null)
    return
  }

  storedGameArchiveAtom.set(createMigratedArchive(legacySession))
  legacyStoredGameSessionAtom.set(null)
}

migrateLegacyStoredGameSession()

function loadGameArchive(): StoredGameArchive {
  migrateLegacyStoredGameSession()
  return storedGameArchiveAtom()
}

function readGameArchive(): StoredGameArchive {
  migrateLegacyStoredGameSession()
  return peek(storedGameArchiveAtom)
}

function mapArchive(
  transform: (current: StoredGameArchive) => StoredGameArchive,
): StoredGameArchive {
  const currentArchive = readGameArchive()
  const nextArchive = transform(currentArchive)

  if (nextArchive !== currentArchive) {
    storedGameArchiveAtom.set(nextArchive)
  }

  return nextArchive
}

function getStoredGameRecord(
  games: Array<StoredGameRecord>,
  gameId: string,
): StoredGameRecord | null {
  return games.find((game) => game.id === gameId) ?? null
}

function getStoredGameSummary(record: StoredGameRecord): StoredGameSummary | null {
  const summary = summarizeStoredGameRecord(record)

  if (!(summary instanceof Error)) {
    return summary
  }

  console.warn(summary)
  return null
}

function sortStoredGameSummaries(
  summaries: Array<StoredGameSummary>,
): Array<StoredGameSummary> {
  return [...summaries].sort((left, right) => right.updatedAt - left.updatedAt)
}

function shouldActivateStoredGame(record: StoredGameRecord): boolean {
  const summary = summarizeStoredGameRecord(record)

  if (summary instanceof Error) {
    console.warn(summary)
    return false
  }

  return !summary.isFinished
}

export const storedGamesAtom = computed(
  () => loadGameArchive().games,
  'storage.gameArchive.games',
)

export const activeGameIdAtom = computed(
  () => loadGameArchive().activeGameId,
  'storage.gameArchive.activeGameId',
)

const storedGameRecordAtomCache = new Map<
  string,
  ReturnType<typeof computed<StoredGameRecord | null>>
>()

export function storedGameRecordAtom(gameId: string) {
  const cached = storedGameRecordAtomCache.get(gameId)

  if (cached) {
    return cached
  }

  const recordAtom = computed(
    () => getStoredGameRecord(storedGamesAtom(), gameId),
    `storage.gameRecord(${gameId})`,
  )

  storedGameRecordAtomCache.set(gameId, recordAtom)
  return recordAtom
}

export function readStoredGameRecord(gameId: string): StoredGameRecord | null {
  return getStoredGameRecord(readGameArchive().games, gameId)
}

const storedGameSummaryAtomCache = new Map<
  string,
  ReturnType<typeof computed<StoredGameSummary | null>>
>()

export function storedGameSummaryAtom(gameId: string) {
  const cached = storedGameSummaryAtomCache.get(gameId)

  if (cached) {
    return cached
  }

  const summaryAtom = computed(() => {
    const record = storedGameRecordAtom(gameId)()

    if (record === null) {
      return null
    }

    return getStoredGameSummary(record)
  }, `storage.gameSummary(${gameId})`)

  storedGameSummaryAtomCache.set(gameId, summaryAtom)
  return summaryAtom
}

export function readStoredGameSummary(gameId: string): StoredGameSummary | null {
  const record = readStoredGameRecord(gameId)

  if (record === null) {
    return null
  }

  return getStoredGameSummary(record)
}

export const storedGameSummariesAtom = computed(() => {
  return sortStoredGameSummaries(
    storedGamesAtom()
      .map((record) => getStoredGameSummary(record))
      .flatMap((summary) => (summary === null ? [] : [summary])),
  )
}, 'storage.gameArchive.summaries')

export const activeStoredGameSummaryAtom = computed(() => {
  const activeGameId = activeGameIdAtom()

  if (activeGameId === null) {
    return null
  }

  const summary = storedGameSummaryAtom(activeGameId)()

  if (summary === null || summary.isFinished) {
    return null
  }

  return summary
}, 'storage.gameArchive.activeSummary')

export function createStoredGameRecord({
  config,
  moves = [],
}: {
  config: MatchConfig
  moves?: Array<UciMove>
}): StoredGameRecord {
  const now = Date.now()

  return {
    id: crypto.randomUUID(),
    version: STORAGE_DATA_VERSION,
    config,
    moves,
    createdAt: now,
    updatedAt: now,
  }
}

export function createStoredGame({
  config,
  moves = [],
  makeActive = false,
}: {
  config: MatchConfig
  moves?: Array<UciMove>
  makeActive?: boolean
}): StoredGameRecord | StorageError {
  const record = createStoredGameRecord({ config, moves })
  const persisted = saveStoredGameRecord(record, { activate: makeActive })

  if (persisted !== null) {
    return persisted
  }

  return new StorageError({
    message: 'Failed to create a saved game record.',
  })
}

export function saveStoredGameRecord(
  record: StoredGameRecord,
  options?: {
    activate?: boolean
  },
): StoredGameRecord | null {
  const normalized = normalizeStoredGameRecordValue(record)

  if (normalized === null) {
    console.warn('Ignored invalid stored game record.')
    return null
  }

  mapArchive((current) => {
    const nextGames = current.games.some((game) => game.id === normalized.id)
      ? current.games.map((game) => (game.id === normalized.id ? normalized : game))
      : [...current.games, normalized]

    return {
      ...current,
      games: nextGames,
      activeGameId:
        options?.activate && shouldActivateStoredGame(normalized)
          ? normalized.id
          : current.activeGameId !== null &&
            nextGames.some((game) => game.id === current.activeGameId)
          ? current.activeGameId
          : null,
    }
  })

  return normalized
}

export function updateStoredGameRecord({
  gameId,
  config,
  moves,
  updatedAt = Date.now(),
}: {
  gameId: string
  config?: MatchConfig
  moves?: Array<UciMove>
  updatedAt?: number
}): StoredGameRecord | null {
  const currentRecord = getStoredGameRecord(readGameArchive().games, gameId)

  if (currentRecord === null) {
    return null
  }

  const nextRecord: StoredGameRecord = {
    ...currentRecord,
    config: config ?? currentRecord.config,
    moves: moves ?? currentRecord.moves,
    updatedAt,
  }

  return saveStoredGameRecord(nextRecord)
}

export function clearStoredGameArchive(): void {
  storedGameRecordAtomCache.clear()
  storedGameSummaryAtomCache.clear()
  storedGameArchiveAtom.set(createEmptyArchive())
  legacyStoredGameSessionAtom.set(null)
}

export function setActiveGameId(gameId: string | null): void {
  mapArchive((current) => {
    const nextActiveGameId =
      gameId !== null && current.games.some((game) => game.id === gameId)
        ? gameId
        : null

    if (current.activeGameId === nextActiveGameId) {
      return current
    }

    return {
      ...current,
      activeGameId: nextActiveGameId,
    }
  })
}

export function replayStoredGameRecord(
  record: StoredGameRecord,
  options?: { moveCount?: number },
): { engine: ChessEngineFacade; snapshot: BoardSnapshot } | StorageError {
  const moveCount = options?.moveCount ?? record.moves.length

  if (moveCount < 0 || moveCount > record.moves.length) {
    return new StorageError({
      message: `Stored move index "${moveCount}" is out of range.`,
    })
  }

  const engine = createChessEngine()

  if (engine instanceof Error) {
    return new StorageError({
      message: 'Failed to initialize the saved game session.',
      cause: engine,
    })
  }

  let snapshot = engine.getBoardSnapshot()

  for (const uci of record.moves.slice(0, moveCount)) {
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

export function summarizeStoredGameRecord(
  record: StoredGameRecord,
): StoredGameSummary | StorageError {
  const replayed = replayStoredGameRecord(record)

  if (replayed instanceof Error) {
    return replayed
  }

  return {
    id: record.id,
    config: record.config,
    moveCount: replayed.snapshot.history.length,
    turn: replayed.snapshot.turn,
    fen: replayed.snapshot.fen,
    statusText: formatStatus(replayed.snapshot),
    isFinished: isTerminalStatus(replayed.snapshot.status),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}
