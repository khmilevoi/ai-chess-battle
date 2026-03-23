import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultMatchConfig } from '@/actors/registry'
import { loadStoredMatchConfig, storedMatchConfig } from './matchConfigStorage'

const STORAGE_KEY = 'ai-chess-battle.match-config'

describe('matchConfigStorage', () => {
  beforeEach(() => {
    storedMatchConfig.set(null)
    window.localStorage.clear()
  })

  it('returns null when nothing is stored', () => {
    expect(loadStoredMatchConfig()).toBeNull()
  })

  it('round-trips valid config through storage', () => {
    const config = createDefaultMatchConfig()

    storedMatchConfig.set(config)

    expect(loadStoredMatchConfig()).toEqual(config)
  })

  it('treats malformed raw json as empty state', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{broken')

    vi.resetModules()
    const { loadStoredMatchConfig } = await import('./matchConfigStorage')

    expect(loadStoredMatchConfig()).toBeNull()
  })

  it('treats malformed raw match configs as empty state', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        white: { actorKey: 'openai', actorConfig: { apiKey: '', model: '' } },
        black: { actorKey: 'human', actorConfig: {} },
      }),
    )

    vi.resetModules()
    const { loadStoredMatchConfig } = await import('./matchConfigStorage')

    expect(loadStoredMatchConfig()).toBeNull()
  })
})
