import { atom, computed, peek, withLocalStorage } from '@reatom/core'
import { type MatchConfig } from '@/actors/registry'
import { createChessEngine } from '@/domain/chess/createChessEngine'
import {
  isTerminalStatus,
  parseUciMove,
  type ActorMove,
  type BoardSnapshot,
  type ChessEngineFacade,
  type UciMove,
} from '@/domain/chess/types'
import { IllegalMoveError, StorageError } from '../errors'
import { vaultSecretsAtom } from './credentialVault'
import {
  normalizeStoredMatchConfigSnapshotValue,
  redactMatchConfig,
  resolveStoredMatchConfig,
  type StoredMatchConfig,
} from './helpers'

const STORAGE_KEY = 'ai-chess-battle.games'
const LEGACY_STORAGE_KEY = 'ai-chess-battle.game-session'
const STORAGE_VERSION = 'games@2'
const LEGACY_STORAGE_VERSION = 'game-session@2'
const STORAGE_DATA_VERSION = 1
let archiveInitialized = false

export type StoredGameActorControls = Record<string, unknown>

type StoredGameStateSnapshot = {
  fen: BoardSnapshot['fen']
  turn: BoardSnapshot['turn']
  status: BoardSnapshot['status']
  moveCount: number
}

type StoredGameRecordSnapshot = {
  id: string
  version: typeof STORAGE_DATA_VERSION
  config: StoredMatchConfig
  actorControls: StoredGameActorControls
  moves: Array<UciMove>
  state: StoredGameStateSnapshot
  createdAt: number
  updatedAt: number
}

type StoredGameArchiveSnapshot = {
  version: typeof STORAGE_DATA_VERSION
  activeGameId: string | null
  games: Array<StoredGameRecordSnapshot>
}

export type StoredGameRecord = {
  id: string
  version: typeof STORAGE_DATA_VERSION
  config: MatchConfig
  actorControls: StoredGameActorControls
  moves: Array<UciMove>
  state: StoredGameStateSnapshot
  createdAt: number
  updatedAt: number
}

type LegacyStoredGameSession = {
  version: typeof STORAGE_DATA_VERSION
  config: StoredMatchConfig
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

function createEmptyArchive(): StoredGameArchiveSnapshot {
  return {
    version: STORAGE_DATA_VERSION,
    activeGameId: null,
    games: [],
  }
}

function formatStatus(status: BoardSnapshot['status']): string {
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

function normalizeStoredGameActorControls(value: unknown): StoredGameActorControls {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }

  const record = value as Record<string, unknown>

  return { ...record }
}

function isStoredGameSide(value: unknown): value is BoardSnapshot['turn'] {
  return value === 'white' || value === 'black'
}

function normalizeStoredGameStatusValue(
  value: unknown,
): BoardSnapshot['status'] | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>

  if (record.kind === 'active' && isStoredGameSide(record.turn)) {
    return {
      kind: 'active',
      turn: record.turn,
    }
  }

  if (record.kind === 'check' && isStoredGameSide(record.turn)) {
    return {
      kind: 'check',
      turn: record.turn,
    }
  }

  if (record.kind === 'checkmate' && isStoredGameSide(record.winner)) {
    return {
      kind: 'checkmate',
      winner: record.winner,
    }
  }

  if (record.kind === 'stalemate') {
    return {
      kind: 'stalemate',
    }
  }

  if (record.kind === 'draw' && typeof record.reason === 'string') {
    return {
      kind: 'draw',
      reason: record.reason,
    }
  }

  return null
}

function normalizeStoredGameStateValue(
  value: unknown,
): StoredGameStateSnapshot | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  const status = normalizeStoredGameStatusValue(record.status)

  if (
    typeof record.fen !== 'string' ||
    record.fen.length === 0 ||
    !isStoredGameSide(record.turn) ||
    status === null ||
    typeof record.moveCount !== 'number' ||
    !Number.isInteger(record.moveCount) ||
    record.moveCount < 0
  ) {
    return null
  }

  return {
    fen: record.fen,
    turn: record.turn,
    status,
    moveCount: record.moveCount,
  }
}

function createStoredGameStateSnapshot(
  snapshot: BoardSnapshot,
): StoredGameStateSnapshot {
  return {
    fen: snapshot.fen,
    turn: snapshot.turn,
    status: snapshot.status,
    moveCount: snapshot.history.length,
  }
}

function createStoredMoveReplayError(error: Error): StorageError {
  if (error instanceof IllegalMoveError) {
    return new StorageError({
      message: `Failed to replay stored move "${error.uci}".`,
      cause: error,
    })
  }

  return new StorageError({
    message: 'Failed to replay stored moves.',
    cause: error,
  })
}

function createStoredGameStateSnapshotFromMoves(
  moves: Array<UciMove>,
): StoredGameStateSnapshot | StorageError {
  const engine = createChessEngine()

  if (engine instanceof Error) {
    return new StorageError({
      message: 'Failed to initialize the saved game session.',
      cause: engine,
    })
  }

  const parsedMoves: Array<ActorMove> = []

  for (const uci of moves) {
    const move = parseUciMove(uci)

    if (move === null) {
      return new StorageError({
        message: `Stored move "${uci}" is invalid.`,
      })
    }

    parsedMoves.push(move)
  }

  const snapshot = engine.applyMoves(parsedMoves)

  if (snapshot instanceof Error) {
    return createStoredMoveReplayError(snapshot)
  }

  return createStoredGameStateSnapshot(snapshot)
}

function normalizeStoredGameRecordSnapshotValue(
  value: unknown,
): StoredGameRecordSnapshot | null {
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

  const config = normalizeStoredMatchConfigSnapshotValue(record.config)

  if (config === null) {
    return null
  }

  if (
    !Array.isArray(record.moves) ||
    !record.moves.every((move) => typeof move === 'string')
  ) {
    return null
  }

  const moves = record.moves as Array<UciMove>
  const state =
    normalizeStoredGameStateValue(record.state) ??
    createStoredGameStateSnapshotFromMoves(moves)

  if (state instanceof Error) {
    console.warn(state)
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
    actorControls: normalizeStoredGameActorControls(record.actorControls),
    moves,
    state,
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

  const config = normalizeStoredMatchConfigSnapshotValue(record.config)

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

function normalizeStoredGameArchiveValue(
  value: unknown,
): StoredGameArchiveSnapshot | null {
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
    .map((entry) => normalizeStoredGameRecordSnapshotValue(entry))
    .filter((entry): entry is StoredGameRecordSnapshot => entry !== null)

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

function resolveStoredGameRecord(
  record: StoredGameRecordSnapshot,
  secretsByActorKey: ReturnType<typeof vaultSecretsAtom>,
): StoredGameRecord {
  return {
    ...record,
    config: resolveStoredMatchConfig(record.config, secretsByActorKey),
  }
}

function getPersistSnapshotValue(persist: unknown): unknown {
  if (typeof persist === 'object' && persist !== null && 'data' in persist) {
    return (persist as { data: unknown }).data
  }

  return persist
}

function readArchiveSnapshotFromStorage(): StoredGameArchiveSnapshot | null {
  const rawSnapshot = window.localStorage.getItem(STORAGE_KEY)

  if (rawSnapshot === null) {
    return null
  }

  try {
    const parsed = JSON.parse(rawSnapshot) as unknown

    return normalizeStoredGameArchiveValue(getPersistSnapshotValue(parsed))
  } catch {
    return null
  }
}

function readLegacyStoredGameSessionSnapshotFromStorage(): LegacyStoredGameSession | null {
  const rawSnapshot = window.localStorage.getItem(LEGACY_STORAGE_KEY)

  if (rawSnapshot === null) {
    return null
  }

  try {
    const parsed = JSON.parse(rawSnapshot) as unknown

    return normalizeLegacyStoredGameSessionValue(getPersistSnapshotValue(parsed))
  } catch {
    return null
  }
}

function createMigratedArchive(
  legacySession: LegacyStoredGameSession,
): StoredGameArchiveSnapshot {
  const state = createStoredGameStateSnapshotFromMoves(legacySession.moves)

  if (state instanceof Error) {
    console.warn(state)
    return createEmptyArchive()
  }

  const migratedRecord: StoredGameRecordSnapshot = {
    id: crypto.randomUUID(),
    version: STORAGE_DATA_VERSION,
    config: legacySession.config,
    actorControls: {},
    moves: legacySession.moves,
    state,
    createdAt: legacySession.updatedAt,
    updatedAt: legacySession.updatedAt,
  }
  const summary = summarizeStoredGameRecord(
    resolveStoredGameRecord(migratedRecord, peek(vaultSecretsAtom)),
  )

  return {
    version: STORAGE_DATA_VERSION,
    activeGameId:
      summary instanceof Error || summary.isFinished ? null : migratedRecord.id,
    games: [migratedRecord],
  }
}

export const storedGameArchiveAtom = atom<StoredGameArchiveSnapshot>(
  createEmptyArchive(),
  'storage.gameArchive',
)

// Debounced localStorage writer: the in-memory atom is always current for UI,
// but disk writes are batched to at most one write per 200 ms.
let archivePersistTimer: ReturnType<typeof setTimeout> | null = null

function persistArchiveNow(archive: StoredGameArchiveSnapshot): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, data: archive }),
    )
  } catch {
    // Storage quota exceeded or unavailable — fail silently.
  }
}

function scheduleArchivePersist(archive: StoredGameArchiveSnapshot): void {
  if (archivePersistTimer !== null) {
    clearTimeout(archivePersistTimer)
  }
  archivePersistTimer = setTimeout(() => {
    archivePersistTimer = null
    persistArchiveNow(archive)
  }, 200)
}

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

function isEmptyArchiveSnapshot(archive: StoredGameArchiveSnapshot): boolean {
  return archive.games.length === 0 && archive.activeGameId === null
}

export function ensureStoredGameArchiveInitialized(): void {
  if (archiveInitialized) {
    return
  }

  const currentArchive = peek(storedGameArchiveAtom)
  const currentLegacySession = peek(legacyStoredGameSessionAtom)
  const archiveSnapshot = isEmptyArchiveSnapshot(currentArchive)
    ? readArchiveSnapshotFromStorage() ?? currentArchive
    : currentArchive
  const legacySession =
    currentLegacySession ?? readLegacyStoredGameSessionSnapshotFromStorage()

  if (legacySession !== null && isEmptyArchiveSnapshot(archiveSnapshot)) {
    const migratedArchive = createMigratedArchive(legacySession)
    storedGameArchiveAtom.set(migratedArchive)
    persistArchiveNow(migratedArchive)
    legacyStoredGameSessionAtom.set(null)
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)
    archiveInitialized = true
    return
  }

  if (archiveSnapshot !== currentArchive) {
    storedGameArchiveAtom.set(archiveSnapshot)
    persistArchiveNow(archiveSnapshot)
  }

  if (legacySession !== null) {
    legacyStoredGameSessionAtom.set(null)
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)
  }

  archiveInitialized = true
}

function loadGameArchive(): StoredGameArchiveSnapshot {
  return storedGameArchiveAtom()
}

function readGameArchive(): StoredGameArchiveSnapshot {
  // Imperative reads are used from route loaders and must not subscribe
  // those loaders to archive writes.
  ensureStoredGameArchiveInitialized()
  return peek(storedGameArchiveAtom)
}

function mapArchive(
  transform: (current: StoredGameArchiveSnapshot) => StoredGameArchiveSnapshot,
): StoredGameArchiveSnapshot {
  const currentArchive = readGameArchive()
  const nextArchive = transform(currentArchive)

  if (nextArchive !== currentArchive) {
    storedGameArchiveAtom.set(nextArchive)
    scheduleArchivePersist(nextArchive)
  }

  return nextArchive
}

function getStoredGameRecord(
  games: Array<StoredGameRecordSnapshot>,
  gameId: string,
): StoredGameRecordSnapshot | null {
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
  () =>
    loadGameArchive().games.map((record) =>
      resolveStoredGameRecord(record, vaultSecretsAtom()),
    ),
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
    () => {
      const record = getStoredGameRecord(loadGameArchive().games, gameId)

      return record === null ? null : resolveStoredGameRecord(record, vaultSecretsAtom())
    },
    `storage.gameRecord(${gameId})`,
  )

  storedGameRecordAtomCache.set(gameId, recordAtom)
  return recordAtom
}

export function readStoredGameRecord(gameId: string): StoredGameRecord | null {
  const record = getStoredGameRecord(readGameArchive().games, gameId)

  return record === null ? null : resolveStoredGameRecord(record, peek(vaultSecretsAtom))
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
  actorControls = {},
  moves = [],
}: {
  config: MatchConfig
  actorControls?: StoredGameActorControls
  moves?: Array<UciMove>
}): StoredGameRecord | StorageError {
  const snapshot = createStoredGameRecordSnapshot({
    config,
    actorControls,
    moves,
  })

  if (snapshot instanceof Error) {
    return snapshot
  }

  return resolveStoredGameRecord(snapshot, peek(vaultSecretsAtom))
}

function createStoredGameRecordSnapshot({
  config,
  actorControls = {},
  moves = [],
}: {
  config: MatchConfig
  actorControls?: StoredGameActorControls
  moves?: Array<UciMove>
}): StoredGameRecordSnapshot | StorageError {
  const now = Date.now()
  const state = createStoredGameStateSnapshotFromMoves(moves)

  if (state instanceof Error) {
    return state
  }

  return {
    id: crypto.randomUUID(),
    version: STORAGE_DATA_VERSION,
    config: redactMatchConfig(config),
    actorControls,
    moves,
    state,
    createdAt: now,
    updatedAt: now,
  }
}

export function createStoredGame({
  config,
  actorControls = {},
  moves = [],
  makeActive = false,
}: {
  config: MatchConfig
  actorControls?: StoredGameActorControls
  moves?: Array<UciMove>
  makeActive?: boolean
}): StoredGameRecord | StorageError {
  ensureStoredGameArchiveInitialized()
  const record = createStoredGameRecord({ config, actorControls, moves })

  if (record instanceof Error) {
    return record
  }

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
    snapshot?: BoardSnapshot
  },
): StoredGameRecord | null {
  ensureStoredGameArchiveInitialized()
  const normalized = normalizeStoredGameRecordSnapshotValue({
    ...record,
    config: redactMatchConfig(record.config),
    state:
      options?.snapshot === undefined
        ? record.state
        : createStoredGameStateSnapshot(options.snapshot),
  })

  if (normalized === null) {
    console.warn('Ignored invalid stored game record.')
    return null
  }

  mapArchive((current) => {
    const nextGames = current.games.some((game) => game.id === normalized.id)
      ? current.games.map((game) => (game.id === normalized.id ? normalized : game))
      : [...current.games, normalized]
    const resolvedRecord = resolveStoredGameRecord(normalized, peek(vaultSecretsAtom))

    return {
      ...current,
      games: nextGames,
      activeGameId:
        options?.activate && shouldActivateStoredGame(resolvedRecord)
          ? normalized.id
          : current.activeGameId !== null &&
            nextGames.some((game) => game.id === current.activeGameId)
          ? current.activeGameId
          : null,
    }
  })

  return resolveStoredGameRecord(normalized, peek(vaultSecretsAtom))
}

export function updateStoredGameRecord({
  gameId,
  config,
  actorControls,
  moves,
  snapshot,
  updatedAt = Date.now(),
}: {
  gameId: string
  config?: MatchConfig
  actorControls?: StoredGameActorControls
  moves?: Array<UciMove>
  snapshot?: BoardSnapshot
  updatedAt?: number
}): StoredGameRecord | null {
  ensureStoredGameArchiveInitialized()
  const currentRecord = getStoredGameRecord(readGameArchive().games, gameId)

  if (currentRecord === null) {
    return null
  }

  const nextRecord = {
    ...currentRecord,
    config: config === undefined ? currentRecord.config : redactMatchConfig(config),
    actorControls: actorControls ?? currentRecord.actorControls,
    moves: moves ?? currentRecord.moves,
    state:
      snapshot === undefined
        ? moves === undefined
          ? currentRecord.state
          : undefined
        : createStoredGameStateSnapshot(snapshot),
    updatedAt,
  }

  const normalized = normalizeStoredGameRecordSnapshotValue(nextRecord)

  if (normalized === null) {
    console.warn('Ignored invalid stored game record update.')
    return null
  }

  mapArchive((current) => ({
    ...current,
    games: current.games.map((game) => (game.id === normalized.id ? normalized : game)),
  }))

  return resolveStoredGameRecord(normalized, peek(vaultSecretsAtom))
}

export function clearStoredGameArchive(): void {
  storedGameRecordAtomCache.clear()
  storedGameSummaryAtomCache.clear()
  const emptyArchive = createEmptyArchive()
  storedGameArchiveAtom.set(emptyArchive)
  persistArchiveNow(emptyArchive)
  legacyStoredGameSessionAtom.set(null)
}

export function setActiveGameId(gameId: string | null): void {
  ensureStoredGameArchiveInitialized()
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

  const moves: Array<ActorMove> = []

  for (const uci of record.moves.slice(0, moveCount)) {
    const move = parseUciMove(uci)

    if (move === null) {
      return new StorageError({
        message: `Stored move "${uci}" is invalid.`,
      })
    }

    moves.push(move)
  }

  const snapshot = engine.applyMoves(moves)

  if (snapshot instanceof Error) {
    return createStoredMoveReplayError(snapshot)
  }

  return { engine, snapshot }
}

export function summarizeStoredGameRecord(
  record: StoredGameRecord,
): StoredGameSummary | StorageError {
  return {
    id: record.id,
    config: record.config,
    moveCount: record.state.moveCount,
    turn: record.state.turn,
    fen: record.state.fen,
    statusText: formatStatus(record.state.status),
    isFinished: isTerminalStatus(record.state.status),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}
