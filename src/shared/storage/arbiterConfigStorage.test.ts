import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_ARBITER_PERSONALITY_KEY } from '@/arbiter/personalities'
import {
  clearStoredArbiterConfigMap,
  loadStoredArbiterConfig,
  saveStoredArbiterConfig,
} from './arbiterConfigStorage'

const STORAGE_KEY = 'ai-chess-battle.arbiter-configs'

describe('arbiterConfigStorage', () => {
  beforeEach(() => {
    clearStoredArbiterConfigMap()
    window.localStorage.clear()
  })

  it('round-trips a valid provider config', () => {
    saveStoredArbiterConfig('openai', {
      model: 'gpt-5-nano',
      personalityKey: DEFAULT_ARBITER_PERSONALITY_KEY,
    })

    expect(loadStoredArbiterConfig('openai')).toEqual({
      model: 'gpt-5-nano',
      personalityKey: DEFAULT_ARBITER_PERSONALITY_KEY,
    })
  })

  it('backfills the default personality on legacy stored model-only configs', async () => {
    vi.resetModules()
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        data: {
          openai: {
            model: 'gpt-5-nano',
          },
        },
        version: 'arbiter-configs@1',
      }),
    )

    const { loadStoredArbiterConfig } = await import('./arbiterConfigStorage')
    await Promise.resolve()

    expect(loadStoredArbiterConfig('openai')).toEqual({
      model: 'gpt-5-nano',
      personalityKey: DEFAULT_ARBITER_PERSONALITY_KEY,
    })
  })

  it('drops stored provider configs with unknown personality keys', async () => {
    vi.resetModules()
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        data: {
          openai: {
            model: 'gpt-5-nano',
            personalityKey: 'unknown',
          },
        },
        version: 'arbiter-configs@1',
      }),
    )

    const { loadStoredArbiterConfig } = await import('./arbiterConfigStorage')
    await Promise.resolve()

    expect(loadStoredArbiterConfig('openai')).toBeNull()
  })
})
