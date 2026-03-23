import { peek } from '@reatom/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultSideConfig } from '../../actors/registry'
import {
  activeGameIdAtom,
  clearStoredGameArchive,
  createStoredGame,
  replayStoredGameRecord,
  setActiveGameId,
  storedGameArchiveAtom,
  storedGameRecordAtom,
  storedGameSummariesAtom,
  storedGamesAtom,
  summarizeStoredGameRecord,
} from './gameSessionStorage'

const GAMES_STORAGE_KEY = 'ai-chess-battle.games'

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

    const olderRecord = peek(storedGameRecordAtom(olderGame.id))
    const newerRecord = peek(storedGameRecordAtom(newerGame.id))

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

    vi.resetModules()
    const { storedGameSummariesAtom } = await import('./gameSessionStorage')

    expect(peek(storedGameSummariesAtom).map((game) => game.id)).toEqual([
      newerGame.id,
      olderGame.id,
    ])
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
})
