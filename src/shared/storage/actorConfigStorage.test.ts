import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_ANTHROPIC_MODEL } from '@/actors/ai-actor/anthropic'
import { DEFAULT_GOOGLE_MODEL } from '@/actors/ai-actor/google'
import { DEFAULT_OPENAI_REASONING_EFFORT } from '@/actors/ai-actor/open-ai'
import { createDefaultSideConfig } from '@/actors/registry'
import { resetVault, setSecret, setupVault } from './credentialVault'
import { clearStoredActorConfigMap, loadStoredActorConfig, saveStoredActorConfig } from './actorConfigStorage'

const STORAGE_KEY = 'ai-chess-battle.actor-configs'

describe('actorConfigStorage', () => {
  beforeEach(() => {
    clearStoredActorConfigMap()
    resetVault()
    window.localStorage.clear()
  })

  it('returns null when actor config is missing', () => {
    expect(loadStoredActorConfig('openai')).toBeNull()
  })

  it('round-trips a valid actor config without persisting the raw api key', async () => {
    expect(await setupVault('test-master-password')).toBeNull()
    expect(await setSecret('openai', 'sk-test')).toBeNull()

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
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain('sk-test')
  })

  it('round-trips Anthropic and Gemini configs', async () => {
    expect(await setupVault('test-master-password')).toBeNull()
    expect(await setSecret('anthropic', 'anthropic-key')).toBeNull()
    expect(await setSecret('google', 'google-key')).toBeNull()

    saveStoredActorConfig('anthropic', {
      apiKey: 'anthropic-key',
      model: DEFAULT_ANTHROPIC_MODEL,
    })
    saveStoredActorConfig('google', {
      apiKey: 'google-key',
      model: DEFAULT_GOOGLE_MODEL,
    })

    expect(loadStoredActorConfig('anthropic')).toEqual({
      apiKey: 'anthropic-key',
      model: DEFAULT_ANTHROPIC_MODEL,
    })
    expect(loadStoredActorConfig('google')).toEqual({
      apiKey: 'google-key',
      model: DEFAULT_GOOGLE_MODEL,
    })
  })

  it('preserves unrelated actor configs when one side changes', async () => {
    expect(await setupVault('test-master-password')).toBeNull()
    expect(await setSecret('openai', 'sk-test')).toBeNull()

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

  it('drops plaintext api keys from legacy raw actor config maps but keeps valid non-secret settings', async () => {
    vi.resetModules()
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        data: {
          openai: {
            apiKey: 'legacy-secret',
            model: 'gpt-5.4-mini',
            reasoningEffort: 'medium',
          },
        },
        version: 'actor-configs@1',
      }),
    )

    const { loadStoredActorConfig } = await import('./actorConfigStorage')
    await Promise.resolve()

    expect(loadStoredActorConfig('openai')).toEqual({
      apiKey: '',
      model: 'gpt-5.4-mini',
      reasoningEffort: 'medium',
    })
  })
})
