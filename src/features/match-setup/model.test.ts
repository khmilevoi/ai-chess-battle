import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultSideConfig } from '../../actors/registry'
import type { MatchConfig } from '../../actors/registry'
import {
  loadStoredMatchConfig,
  saveStoredMatchConfig,
} from '../../shared/storage/matchConfigStorage'
import { createMatchSetupModel } from './model'

function getLoadedConfig(): MatchConfig {
  const loaded = loadStoredMatchConfig()

  if (loaded instanceof Error || loaded === null) {
    throw new Error('Expected stored match config to load successfully in test.')
  }

  return loaded
}

describe('createMatchSetupModel', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('hydrates the model from config loaded from storage', () => {
    const storedConfig: MatchConfig = {
      white: {
        actorKey: 'openai',
        actorConfig: {
          apiKey: 'sk-test',
          model: 'gpt-5-mini-2025-08-07',
        },
      },
      black: createDefaultSideConfig('human'),
    }

    expect(saveStoredMatchConfig(storedConfig)).toBeNull()

    const model = createMatchSetupModel({
      name: `test-setup-${crypto.randomUUID()}`,
      initialConfig: getLoadedConfig(),
      startSession: vi.fn(),
      goToGame: vi.fn(),
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
      startSession,
      goToGame,
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
      startSession: (config) => {
        sessionConfig = config
      },
      goToGame,
    })

    const result = await model.startMatch()

    expect(result).toBeNull()
    expect(sessionConfig).toEqual(initialConfig)
    expect(goToGame).toHaveBeenCalledTimes(1)
    expect(loadStoredMatchConfig()).toEqual(initialConfig)
  })
})
