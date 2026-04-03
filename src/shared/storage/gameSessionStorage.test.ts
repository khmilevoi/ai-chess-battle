import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultSideConfig } from '@/actors/registry'
import {
  activeGameIdAtom,
  clearStoredGameArchive,
  createStoredGame,
  replayStoredGameRecord,
  saveStoredGameRecord,
  setActiveGameId,
  ensureStoredGameArchiveInitialized,
  resetStoredGameArchiveInitializationForTests,
  storedGameArchiveAtom,
  storedGameRecordAtom,
  storedGameSummariesAtom,
  storedGamesAtom,
  summarizeStoredGameRecord,
  updateStoredGameRecord,
} from './gameSessionStorage'

const GAMES_STORAGE_KEY = 'ai-chess-battle.games'
const LEGACY_STORAGE_KEY = 'ai-chess-battle.game-session'

function createLegacySessionSnapshot(): string {
  return JSON.stringify({
    version: 1,
    config: {
      white: createDefaultSideConfig('human'),
      black: createDefaultSideConfig('human'),
    },
    moves: ['e2e4', 'e7e5'],
    updatedAt: 1,
  })
}

function createRequiredStoredGame(
  ...args: Parameters<typeof createStoredGame>
) {
  const game = createStoredGame(...args)

  if (game instanceof Error) {
    throw game
  }

  return game
}

describe('gameSessionStorage', () => {
  beforeEach(() => {
    clearStoredGameArchive()
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts empty when there are no saved games', () => {
    expect(storedGamesAtom()).toEqual([])
    expect(activeGameIdAtom()).toBeNull()
  })

  it('creates multiple saved games instead of overwriting the previous one', () => {
    const firstGame = createRequiredStoredGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      moves: ['e2e4'],
    })
    const secondGame = createRequiredStoredGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      moves: ['d2d4'],
    })

    expect(storedGamesAtom()).toHaveLength(2)
    expect(storedGameRecordAtom(firstGame.id)()?.moves).toEqual(['e2e4'])
    expect(storedGameRecordAtom(secondGame.id)()?.moves).toEqual(['d2d4'])
  })

  it('bootstraps legacy storage on import without mutating reactive reads', async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, createLegacySessionSnapshot())

    resetStoredGameArchiveInitializationForTests()
    ensureStoredGameArchiveInitialized()
    const archiveSetSpy = vi.spyOn(storedGameArchiveAtom, 'set')

    const games = storedGamesAtom()

    expect(games).toHaveLength(1)
    expect(activeGameIdAtom()).toBe(games[0]?.id ?? null)
    expect(window.localStorage.getItem(GAMES_STORAGE_KEY)).toBeTruthy()
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull()
    expect(archiveSetSpy).not.toHaveBeenCalled()
  })

  it('keeps the archive initializer idempotent after bootstrap', () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, createLegacySessionSnapshot())

    resetStoredGameArchiveInitializationForTests()
    ensureStoredGameArchiveInitialized()
    const archiveBefore = storedGameArchiveAtom()
    const archiveSetSpy = vi.spyOn(storedGameArchiveAtom, 'set')
    const removeItemSpy = vi.spyOn(window.localStorage, 'removeItem')

    ensureStoredGameArchiveInitialized()

    expect(archiveSetSpy).not.toHaveBeenCalled()
    expect(removeItemSpy).not.toHaveBeenCalled()
    expect(storedGameArchiveAtom()).toBe(archiveBefore)
  })

  it('persists actor controls on saved game records', () => {
    const game = createRequiredStoredGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      actorControls: {
        openai: {
          waitForConfirmation: true,
        },
      },
    })

    expect(storedGameRecordAtom(game.id)()?.actorControls).toEqual({
      openai: {
        waitForConfirmation: true,
      },
    })
  })

  it('updates actor controls without dropping config or moves', () => {
    const game = createRequiredStoredGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      moves: ['e2e4'],
    })

    const updated = updateStoredGameRecord({
      gameId: game.id,
      actorControls: {
        openai: {
          waitForConfirmation: true,
        },
      },
      updatedAt: 42,
    })

    expect(updated).toEqual(
      expect.objectContaining({
        config: game.config,
        moves: ['e2e4'],
        updatedAt: 42,
        actorControls: {
          openai: {
            waitForConfirmation: true,
          },
        },
      }),
    )
  })

  it('replays and summarizes a saved game record', () => {
    const game = createRequiredStoredGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      moves: ['e2e4', 'e7e5', 'g1f3'],
    })
    const replayed = replayStoredGameRecord(game)

    expect(replayed).not.toBeInstanceOf(Error)

    if (replayed instanceof Error) {
      throw replayed
    }

    expect(replayed.snapshot.history).toEqual(['e2e4', 'e7e5', 'g1f3'])
    expect(replayed.snapshot.turn).toBe('black')

    const summary = summarizeStoredGameRecord(game)
    expect(summary).toEqual(
      expect.objectContaining({
        id: game.id,
        moveCount: 3,
        turn: 'black',
        isFinished: false,
      }),
    )
  })

  it('sorts summaries by last update time', () => {
    const olderGame = createRequiredStoredGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      moves: ['e2e4'],
    })
    const newerGame = createRequiredStoredGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      moves: ['d2d4'],
    })

    const olderRecord = storedGameRecordAtom(olderGame.id)()
    const newerRecord = storedGameRecordAtom(newerGame.id)()

    if (!olderRecord || !newerRecord) {
      throw new Error('Expected saved records to be available in test.')
    }

    olderRecord.updatedAt = 1
    newerRecord.updatedAt = 2
    window.localStorage.setItem(
      GAMES_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        activeGameId: null,
        games: [olderRecord, newerRecord],
      }),
    )

    resetStoredGameArchiveInitializationForTests()
    ensureStoredGameArchiveInitialized()

    expect(storedGameSummariesAtom().map((game) => game.id)).toEqual([
      newerGame.id,
      olderGame.id,
    ])
  })

  it('hydrates legacy saved games without actor controls', () => {
    const gameId = crypto.randomUUID()
    const saved = saveStoredGameRecord({
      id: gameId,
      version: 1,
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      moves: [],
      createdAt: 1,
      updatedAt: 1,
    } as never)

    expect(saved?.actorControls).toEqual({})
  })

  it('tracks the active unfinished game explicitly', () => {
    const game = createRequiredStoredGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
    })

    setActiveGameId(game.id)

    expect(activeGameIdAtom()).toBe(game.id)
    expect(storedGameSummariesAtom()[0]?.id).toBe(game.id)
  })

  it('does not rewrite the archive when the active game id is unchanged', () => {
    const game = createRequiredStoredGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
    })

    setActiveGameId(game.id)

    const archiveBefore = storedGameArchiveAtom()
    const setSpy = vi.spyOn(storedGameArchiveAtom, 'set')

    setActiveGameId(game.id)

    expect(setSpy).not.toHaveBeenCalled()
    expect(storedGameArchiveAtom()).toBe(archiveBefore)
  })

  it('does not rewrite the archive when clearing an already empty active game id', () => {
    const archiveBefore = storedGameArchiveAtom()
    const setSpy = vi.spyOn(storedGameArchiveAtom, 'set')

    setActiveGameId(null)

    expect(setSpy).not.toHaveBeenCalled()
    expect(storedGameArchiveAtom()).toBe(archiveBefore)
  })
})
