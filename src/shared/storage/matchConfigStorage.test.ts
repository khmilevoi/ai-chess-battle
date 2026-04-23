import { beforeEach, describe, expect, it, vi } from 'vitest'
import { peek } from '@reatom/core'
import { createDefaultMatchConfig } from '@/actors/registry'
import { normalizeStoredMatchConfigSnapshotValue } from './helpers'
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

  it('round-trips arbiter config through storage', () => {
    storedMatchConfig.save({
      white: createDefaultMatchConfig().white,
      black: createDefaultMatchConfig().black,
      arbiter: {
        arbiterKey: 'openai',
        arbiterConfig: {
          model: 'gpt-5-nano',
        },
      },
    })

    expect(loadStoredMatchConfig()).toEqual({
      white: createDefaultMatchConfig().white,
      black: createDefaultMatchConfig().black,
      arbiter: {
        arbiterKey: 'openai',
        arbiterConfig: {
          model: 'gpt-5-nano',
        },
      },
    })
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
      arbiter: null,
    })
  })

  it('treats missing legacy arbiter config as null', () => {
    expect(
      normalizeStoredMatchConfigSnapshotValue({
        white: { actorKey: 'human', actorConfig: {} },
        black: { actorKey: 'human', actorConfig: {} },
      }),
    ).toEqual({
      white: { actorKey: 'human', actorConfig: {} },
      black: { actorKey: 'human', actorConfig: {} },
      arbiter: null,
    })
  })

  it('clears persisted config through the semantic atom action', () => {
    storedMatchConfig.save(createDefaultMatchConfig())
    storedMatchConfig.clear()

    expect(peek(storedMatchConfig)).toBeNull()
    expect(loadStoredMatchConfig()).toBeNull()
  })
})
