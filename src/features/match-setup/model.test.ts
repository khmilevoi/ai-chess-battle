import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPENAI_REASONING_EFFORT } from '../../actors/openai'
import { createDefaultSideConfig } from '../../actors/registry'
import type { MatchConfig } from '../../actors/registry'
import {
  clearStoredActorConfigMap,
  loadStoredActorConfig,
} from '../../shared/storage/actorConfigStorage'
import {
  clearStoredGameSession,
  loadStoredGameSession,
} from '../../shared/storage/gameSessionStorage'
import {
  loadStoredMatchConfig,
  storedMatchConfig,
} from '../../shared/storage/matchConfigStorage'
import { createMatchSetupModel } from './model'

function getLoadedConfig(): MatchConfig {
  const loaded = loadStoredMatchConfig()

  if (loaded === null) {
    throw new Error('Expected stored match config to load successfully in test.')
  }

  return loaded
}

describe('createMatchSetupModel', () => {
  beforeEach(() => {
    clearStoredActorConfigMap()
    storedMatchConfig.set(null)
    clearStoredGameSession()
    window.localStorage.clear()
  })

  it('hydrates the model from config loaded from storage', () => {
    const storedConfig: MatchConfig = {
      white: {
        actorKey: 'openai',
        actorConfig: {
          apiKey: 'sk-test',
          model: 'gpt-5-mini-2025-08-07',
          reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
        },
      },
      black: createDefaultSideConfig('human'),
    }

    storedMatchConfig.set(storedConfig)

    const model = createMatchSetupModel({
      name: `test-setup-${crypto.randomUUID()}`,
      initialConfig: getLoadedConfig(),
      activeGameSummary: null,
      startSession: vi.fn(),
      goToGame: vi.fn(),
      resumeMatch: vi.fn(),
    })

    expect(model.whiteSideConfig()).toEqual(storedConfig.white)
    expect(model.blackSideConfig()).toEqual(storedConfig.black)
  })

  it('blocks start when actor config is invalid', async () => {
    const startSession = vi.fn()
    const goToGame = vi.fn()
    const model = createMatchSetupModel({
      name: `test-setup-${crypto.randomUUID()}`,
      initialConfig: {
        white: createDefaultSideConfig('openai'),
        black: createDefaultSideConfig('human'),
      },
      activeGameSummary: null,
      startSession,
      goToGame,
      resumeMatch: vi.fn(),
    })

    const result = await model.startMatch()

    expect(result).toBeInstanceOf(Error)
    expect(model.setupError()).toBeInstanceOf(Error)
    expect(model.canStart()).toBe(false)
    expect(startSession).not.toHaveBeenCalled()
    expect(goToGame).not.toHaveBeenCalled()
  })

  it('writes storage and starts a session on successful start', async () => {
    const goToGame = vi.fn()
    let sessionConfig: MatchConfig | null = null
    const initialConfig: MatchConfig = {
      white: createDefaultSideConfig('human'),
      black: createDefaultSideConfig('human'),
    }

    const model = createMatchSetupModel({
      name: `test-setup-${crypto.randomUUID()}`,
      initialConfig,
      activeGameSummary: null,
      startSession: (config) => {
        sessionConfig = config
      },
      goToGame,
      resumeMatch: vi.fn(),
    })

    const result = await model.startMatch()

    expect(result).toBeNull()
    expect(sessionConfig).toEqual(initialConfig)
    expect(goToGame).toHaveBeenCalledTimes(1)
    expect(loadStoredMatchConfig()).toEqual(initialConfig)
    expect(loadStoredGameSession()).toEqual(
      expect.objectContaining({
        config: initialConfig,
        moves: [],
      }),
    )
  })

  it('keeps shared actor config synchronized between both sides', () => {
    const model = createMatchSetupModel({
      name: `test-setup-${crypto.randomUUID()}`,
      initialConfig: {
        white: createDefaultSideConfig('openai'),
        black: createDefaultSideConfig('openai'),
      },
      activeGameSummary: null,
      startSession: vi.fn(),
      goToGame: vi.fn(),
      resumeMatch: vi.fn(),
    })

    model.updateSideConfig('white', {
      actorKey: 'openai',
      actorConfig: {
        apiKey: 'sk-shared',
        model: 'gpt-5.4-mini',
        reasoningEffort: 'medium',
      },
    })

    expect(model.whiteSideConfig()).toEqual(model.blackSideConfig())
    expect(loadStoredActorConfig('openai')).toEqual({
      apiKey: 'sk-shared',
      model: 'gpt-5.4-mini',
      reasoningEffort: 'medium',
    })
  })
})
