import { peek } from '@reatom/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultSideConfig } from '@/actors/registry'

const GAMES_STORAGE_KEY = 'ai-chess-battle.games'
const LEGACY_STORAGE_KEY = 'ai-chess-battle.game-session'

describe('gameSessionStorage migration', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('migrates the legacy single-session payload into the new archive', async () => {
    window.localStorage.removeItem(GAMES_STORAGE_KEY)
    window.localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        config: {
          white: createDefaultSideConfig('human'),
          black: createDefaultSideConfig('human'),
        },
        moves: ['e2e4', 'e7e5'],
        updatedAt: 1,
      }),
    )

    vi.resetModules()
    const storage = await import('./gameSessionStorage')
    const games = peek(storage.storedGamesAtom)

    expect(games).toHaveLength(1)
    expect(games[0]?.moves).toEqual(['e2e4', 'e7e5'])
    expect(peek(storage.activeGameIdAtom)).toBe(games[0]?.id ?? null)
  })
})
