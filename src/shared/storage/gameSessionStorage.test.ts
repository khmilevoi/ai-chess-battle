import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultSideConfig } from '../../actors/registry'
import {
  clearStoredGameSession,
  createStoredGameSession,
  loadStoredGameSession,
  replayGameSession,
  saveStoredGameSession,
  summarizeStoredGameSession,
} from './gameSessionStorage'

const STORAGE_KEY = 'ai-chess-battle.game-session'

describe('gameSessionStorage', () => {
  beforeEach(() => {
    clearStoredGameSession()
    window.localStorage.clear()
  })

  it('returns null when there is no active session', () => {
    expect(loadStoredGameSession()).toBeNull()
  })

  it('round-trips and replays a stored session', () => {
    const session = createStoredGameSession({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      moves: ['e2e4', 'e7e5', 'g1f3'],
    })

    saveStoredGameSession(session)

    const loaded = loadStoredGameSession()
    expect(loaded).toEqual(expect.objectContaining({ moves: session.moves }))

    if (loaded === null) {
      throw new Error('Expected stored session to be available in test.')
    }

    const replayed = replayGameSession(loaded)
    expect(replayed).not.toBeInstanceOf(Error)

    if (replayed instanceof Error) {
      throw replayed
    }

    expect(replayed.snapshot.history).toEqual(['e2e4', 'e7e5', 'g1f3'])
    expect(replayed.snapshot.turn).toBe('black')
  })

  it('builds a summary for the active session', () => {
    const summary = summarizeStoredGameSession(
      createStoredGameSession({
        config: {
          white: createDefaultSideConfig('human'),
          black: createDefaultSideConfig('human'),
        },
        moves: ['e2e4', 'e7e5'],
      }),
    )

    expect(summary).toEqual(
      expect.objectContaining({
        moveCount: 2,
        turn: 'white',
        isFinished: false,
      }),
    )
  })

  it('treats malformed raw session payloads as empty state', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"version":1,"config":null,"moves":[],"updatedAt":1}')

    vi.resetModules()
    const { loadStoredGameSession } = await import('./gameSessionStorage')

    expect(loadStoredGameSession()).toBeNull()
  })
})
