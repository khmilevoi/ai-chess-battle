import { beforeEach, describe, expect, it, vi } from 'vitest'
import { peek } from '@reatom/core'
import { createDefaultMatchConfig } from '@/actors/registry'
import { loadStoredMatchConfig, storedMatchConfig } from './matchConfigStorage'

const STORAGE_KEY = 'ai-chess-battle.match-config'

describe('matchConfigStorage', () => {
  beforeEach(() => {
    storedMatchConfig.clear()
    window.localStorage.clear()
  })

  it('returns null when nothing is stored', () => {
    expect(peek(storedMatchConfig)).toBeNull()
    expect(loadStoredMatchConfig()).toBeNull()
  })

  it('round-trips valid config through storage', () => {
    const config = createDefaultMatchConfig()

    storedMatchConfig.save(config)

    expect(peek(storedMatchConfig)).not.toBeNull()
    expect(loadStoredMatchConfig()).toEqual(config)
  })

  it('does not persist provider api keys in plaintext', () => {
    storedMatchConfig.save({
      white: {
        actorKey: 'openai',
        actorConfig: {
          apiKey: 'sk-test',
          model: 'gpt-5.4-mini',
          reasoningEffort: 'medium',
        },
      },
      black: {
        actorKey: 'human',
        actorConfig: {},
      },
    })

    expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain('sk-test')
  })

  it('treats malformed raw json as empty state', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{broken')

    vi.resetModules()
    const { loadStoredMatchConfig } = await import('./matchConfigStorage')

    expect(loadStoredMatchConfig()).toBeNull()
  })

  it('drops plaintext api keys from legacy raw match configs while keeping valid non-secret settings', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        data: {
          white: {
            actorKey: 'openai',
            actorConfig: {
              apiKey: 'legacy-secret',
              model: 'gpt-5.4-mini',
              reasoningEffort: 'medium',
            },
          },
          black: { actorKey: 'human', actorConfig: {} },
        },
        version: 'match-config@1',
      }),
    )

    vi.resetModules()
    const { loadStoredMatchConfig } = await import('./matchConfigStorage')

    expect(loadStoredMatchConfig()).toEqual({
      white: {
        actorKey: 'openai',
        actorConfig: {
          apiKey: '',
          model: 'gpt-5.4-mini',
          reasoningEffort: 'medium',
        },
      },
      black: { actorKey: 'human', actorConfig: {} },
    })
  })

  it('clears persisted config through the semantic atom action', () => {
    storedMatchConfig.save(createDefaultMatchConfig())
    storedMatchConfig.clear()

    expect(peek(storedMatchConfig)).toBeNull()
    expect(loadStoredMatchConfig()).toBeNull()
  })
})
