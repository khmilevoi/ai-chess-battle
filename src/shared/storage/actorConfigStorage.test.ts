import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPENAI_REASONING_EFFORT } from '../../actors/ai-actor/open-ai'
import { createDefaultSideConfig } from '../../actors/registry'
import { clearStoredActorConfigMap, loadStoredActorConfig, saveStoredActorConfig } from './actorConfigStorage'

const STORAGE_KEY = 'ai-chess-battle.actor-configs'

describe('actorConfigStorage', () => {
  beforeEach(() => {
    clearStoredActorConfigMap()
    window.localStorage.clear()
  })

  it('returns null when actor config is missing', () => {
    expect(loadStoredActorConfig('openai')).toBeNull()
  })

  it('round-trips a valid actor config', () => {
    saveStoredActorConfig('openai', {
      apiKey: 'sk-test',
      model: 'gpt-5.4-mini',
      reasoningEffort: 'medium',
    })

    expect(loadStoredActorConfig('openai')).toEqual({
      apiKey: 'sk-test',
      model: 'gpt-5.4-mini',
      reasoningEffort: 'medium',
    })
  })

  it('preserves unrelated actor configs when one side changes', () => {
    saveStoredActorConfig('openai', {
      apiKey: 'sk-test',
      model: 'gpt-5.4-mini',
      reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
    })
    saveStoredActorConfig('human', createDefaultSideConfig('human').actorConfig)

    expect(loadStoredActorConfig('openai')).toEqual({
      apiKey: 'sk-test',
      model: 'gpt-5.4-mini',
      reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
    })
    expect(loadStoredActorConfig('human')).toEqual(createDefaultSideConfig('human').actorConfig)
  })

  it('treats malformed raw actor config maps as empty state', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"openai":{"apiKey":"x","model":""}}')

    vi.resetModules()
    const { loadStoredActorConfig } = await import('./actorConfigStorage')

    expect(loadStoredActorConfig('openai')).toBeNull()
  })
})
