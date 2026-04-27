import { peek } from '@reatom/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_ARBITER_PERSONALITY_KEY } from '@/arbiter/personalities'
import { createDefaultSideConfig } from '@/actors/registry'
import {
  activeGameIdAtom,
  clearStoredGameArchive,
  createStoredGame,
  replayStoredGameRecord,
  saveStoredGameRecord,
  setActiveGameId,
  storedGameArchiveAtom,
  storedGameRecordAtom,
  storedGameSummariesAtom,
  storedGamesAtom,
  summarizeStoredGameRecord,
  updateStoredGameRecord,
} from './gameSessionStorage'

const GAMES_STORAGE_KEY = 'ai-chess-battle.games'
const LEGACY_GAMES_STORAGE_KEY = 'ai-chess-battle.game-session'

function createLegacySessionSnapshot() {
  return JSON.stringify({
    data: {
      version: 1,
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      moves: ['e2e4'],
      updatedAt: 1,
    },
    version: 'game-session@2',
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
    vi.useRealTimers()
  })

  it('starts empty when there are no saved games', () => {
    expect(peek(storedGamesAtom)).toEqual([])
    expect(peek(activeGameIdAtom)).toBeNull()
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

    expect(peek(storedGamesAtom)).toHaveLength(2)
    expect(peek(storedGameRecordAtom(firstGame.id))?.moves).toEqual(['e2e4'])
    expect(peek(storedGameRecordAtom(secondGame.id))?.moves).toEqual(['d2d4'])
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

    expect(peek(storedGameRecordAtom(game.id))?.actorControls).toEqual({
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

  it('persists arbiter evaluations without advancing updatedAt when explicitly preserved', () => {
    const game = createRequiredStoredGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
        arbiter: {
          arbiterKey: 'openai',
          arbiterConfig: {
            model: 'gpt-5-nano',
            personalityKey: DEFAULT_ARBITER_PERSONALITY_KEY,
          },
        },
      },
      moves: ['e2e4'],
    })

    const updated = updateStoredGameRecord({
      gameId: game.id,
      evaluations: [
        {
          score: 32,
          comment: 'White starts with a clean claim to the center.',
        },
      ],
      updatedAt: game.updatedAt,
    })

    expect(updated).toEqual(
      expect.objectContaining({
        updatedAt: game.updatedAt,
        evaluations: [
          {
            score: 32,
            comment: 'White starts with a clean claim to the center.',
          },
        ],
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

  it('sorts summaries by last update time', async () => {
    vi.resetModules()
    window.localStorage.setItem(
      GAMES_STORAGE_KEY,
      JSON.stringify({
        data: {
          version: 1,
          activeGameId: null,
          games: [
            {
              id: 'older',
              version: 1,
              config: {
                white: createDefaultSideConfig('human'),
                black: createDefaultSideConfig('human'),
              },
              actorControls: {},
              moves: ['e2e4'],
              createdAt: 1,
              updatedAt: 1,
            },
            {
              id: 'newer',
              version: 1,
              config: {
                white: createDefaultSideConfig('human'),
                black: createDefaultSideConfig('human'),
              },
              actorControls: {},
              moves: ['d2d4'],
              createdAt: 1,
              updatedAt: 2,
            },
          ],
        },
        version: 'games@1',
      }),
    )
    const module = await import('./gameSessionStorage')

    module.ensureStoredGameArchiveInitialized()

    expect(peek(module.storedGameSummariesAtom).map((game) => game.id)).toEqual([
      'newer',
      'older',
    ])
  })

  it('reads summaries from cached state without replaying stored moves', async () => {
    vi.resetModules()
    window.localStorage.setItem(
      GAMES_STORAGE_KEY,
      JSON.stringify({
        data: {
          version: 1,
          activeGameId: null,
          games: [
            {
              id: 'cached-invalid-moves',
              version: 1,
              config: {
                white: createDefaultSideConfig('human'),
                black: createDefaultSideConfig('human'),
              },
              actorControls: {},
              moves: ['e2e5'],
              state: {
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
                turn: 'black',
                status: {
                  kind: 'active',
                  turn: 'black',
                },
                moveCount: 1,
              },
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
        version: 'games@2',
      }),
    )
    const module = await import('./gameSessionStorage')

    module.ensureStoredGameArchiveInitialized()

    expect(peek(module.storedGameSummariesAtom)).toEqual([
      expect.objectContaining({
        id: 'cached-invalid-moves',
        moveCount: 1,
        turn: 'black',
        statusText: 'black to move',
        isFinished: false,
      }),
    ])
  })

  it('backfills cached state for legacy archive records', async () => {
    vi.resetModules()
    window.localStorage.setItem(
      GAMES_STORAGE_KEY,
      JSON.stringify({
        data: {
          version: 1,
          activeGameId: null,
          games: [
            {
              id: 'legacy-record',
              version: 1,
              config: {
                white: createDefaultSideConfig('human'),
                black: createDefaultSideConfig('human'),
              },
              actorControls: {},
              moves: ['e2e4'],
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
        version: 'games@1',
      }),
    )
    const module = await import('./gameSessionStorage')

    module.ensureStoredGameArchiveInitialized()

    expect(peek(module.storedGameSummariesAtom)).toEqual([
      expect.objectContaining({
        id: 'legacy-record',
        moveCount: 1,
        turn: 'black',
      }),
    ])

    const rawSnapshot = window.localStorage.getItem(GAMES_STORAGE_KEY)
    expect(rawSnapshot).not.toBeNull()

    const persisted = JSON.parse(rawSnapshot ?? '{}') as {
      data?: {
        games?: Array<{
          state?: unknown
        }>
      }
    }

    expect(persisted.data?.games?.[0]?.state).toEqual(
      expect.objectContaining({
        moveCount: 1,
        turn: 'black',
      }),
    )
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

  it('normalizes malformed evaluation entries to null while preserving array length', async () => {
    vi.resetModules()
    window.localStorage.setItem(
      GAMES_STORAGE_KEY,
      JSON.stringify({
        data: {
          version: 1,
          activeGameId: null,
          games: [
            {
              id: 'arbiter-record',
              version: 1,
              config: {
                white: createDefaultSideConfig('human'),
                black: createDefaultSideConfig('human'),
                arbiter: {
                  arbiterKey: 'openai',
                  arbiterConfig: {
                    model: 'gpt-5-nano',
                    personalityKey: DEFAULT_ARBITER_PERSONALITY_KEY,
                  },
                },
              },
              actorControls: {},
              moves: ['e2e4', 'e7e5'],
              evaluations: [
                { score: 23, comment: 'Playable edge.' },
                { score: 'bad', comment: 12 },
                null,
              ],
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
        version: 'games@2',
      }),
    )
    const module = await import('./gameSessionStorage')

    module.ensureStoredGameArchiveInitialized()

    expect(peek(module.storedGamesAtom)[0]?.evaluations).toEqual([
      { score: 23, comment: 'Playable edge.' },
      null,
      null,
    ])
  })

  it('does not persist provider api keys in saved game archives', () => {
    vi.useFakeTimers()
    createRequiredStoredGame({
      config: {
        white: {
          actorKey: 'openai',
          actorConfig: {
            apiKey: 'sk-archive-secret',
            model: 'gpt-5.4-mini',
            reasoningEffort: 'medium',
          },
        },
        black: createDefaultSideConfig('human'),
      },
    })
    vi.advanceTimersByTime(200)

    expect(window.localStorage.getItem(GAMES_STORAGE_KEY)).not.toContain(
      'sk-archive-secret',
    )
  })

  it('tracks the active unfinished game explicitly', () => {
    const game = createRequiredStoredGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
    })

    setActiveGameId(game.id)

    expect(peek(activeGameIdAtom)).toBe(game.id)
    expect(peek(storedGameSummariesAtom)[0]?.id).toBe(game.id)
  })

  it('does not rewrite the archive when the active game id is unchanged', () => {
    const game = createRequiredStoredGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
    })

    setActiveGameId(game.id)

    const archiveBefore = peek(storedGameArchiveAtom)
    const setSpy = vi.spyOn(storedGameArchiveAtom, 'set')

    setActiveGameId(game.id)

    expect(setSpy).not.toHaveBeenCalled()
    expect(peek(storedGameArchiveAtom)).toBe(archiveBefore)
  })

  it('does not rewrite the archive when clearing an already empty active game id', () => {
    const archiveBefore = peek(storedGameArchiveAtom)
    const setSpy = vi.spyOn(storedGameArchiveAtom, 'set')

    setActiveGameId(null)

    expect(setSpy).not.toHaveBeenCalled()
    expect(peek(storedGameArchiveAtom)).toBe(archiveBefore)
  })

  it('keeps legacy storage untouched until the archive initializer runs', async () => {
    window.localStorage.setItem(LEGACY_GAMES_STORAGE_KEY, createLegacySessionSnapshot())

    vi.resetModules()
    const module = await import('./gameSessionStorage')

    expect(window.localStorage.getItem(GAMES_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(LEGACY_GAMES_STORAGE_KEY)).not.toBeNull()
    expect(peek(module.storedGamesAtom)).toEqual([])
    expect(peek(module.activeGameIdAtom)).toBeNull()
    expect(window.localStorage.getItem(GAMES_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(LEGACY_GAMES_STORAGE_KEY)).not.toBeNull()
  })

  it('initializes legacy storage idempotently', async () => {
    window.localStorage.setItem(LEGACY_GAMES_STORAGE_KEY, createLegacySessionSnapshot())

    vi.resetModules()
    const module = await import('./gameSessionStorage')
    const setSpy = vi.spyOn(module.storedGameArchiveAtom, 'set')

    module.ensureStoredGameArchiveInitialized()
    const archivedSnapshot = window.localStorage.getItem(GAMES_STORAGE_KEY)

    expect(archivedSnapshot).not.toBeNull()
    expect(window.localStorage.getItem(LEGACY_GAMES_STORAGE_KEY)).toBeNull()

    module.ensureStoredGameArchiveInitialized()

    expect(setSpy).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem(GAMES_STORAGE_KEY)).toBe(archivedSnapshot)
  })
})
