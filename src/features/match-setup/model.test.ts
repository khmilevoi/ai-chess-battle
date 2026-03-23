import { peek } from '@reatom/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPENAI_REASONING_EFFORT } from '../../actors/ai-actor/open-ai'
import { createDefaultSideConfig } from '../../actors/registry'
import type { MatchConfig } from '../../actors/registry'
import {
  clearStoredActorConfigMap,
  loadStoredActorConfig,
} from '../../shared/storage/actorConfigStorage'
import {
  activeGameIdAtom,
  clearStoredGameArchive,
  storedGameRecordAtom,
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
    clearStoredGameArchive()
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
      goToGame: vi.fn(),
      goToGames: vi.fn(),
    })

    expect(model.whiteSideConfig()).toEqual(storedConfig.white)
    expect(model.blackSideConfig()).toEqual(storedConfig.black)
  })

  it('blocks start when actor config is invalid', async () => {
    const goToGame = vi.fn()
    const model = createMatchSetupModel({
      name: `test-setup-${crypto.randomUUID()}`,
      initialConfig: {
        white: createDefaultSideConfig('openai'),
        black: createDefaultSideConfig('human'),
      },
      goToGame,
      goToGames: vi.fn(),
    })

    const result = await model.startMatch()

    expect(result).toBeInstanceOf(Error)
    expect(model.setupError()).toBeInstanceOf(Error)
    expect(model.canStart()).toBe(false)
    expect(goToGame).not.toHaveBeenCalled()
  })

  it('creates a saved game and marks it active on successful start', async () => {
    const goToGame = vi.fn()
    const initialConfig: MatchConfig = {
      white: createDefaultSideConfig('human'),
      black: createDefaultSideConfig('human'),
    }

    const model = createMatchSetupModel({
      name: `test-setup-${crypto.randomUUID()}`,
      initialConfig,
      goToGame,
      goToGames: vi.fn(),
    })

    const result = await model.startMatch()

    expect(result).toBeNull()
    expect(loadStoredMatchConfig()).toEqual(initialConfig)
    expect(goToGame).toHaveBeenCalledTimes(1)

    const activeGameId = peek(activeGameIdAtom)
    expect(activeGameId).not.toBeNull()

    const activeGame =
      activeGameId === null ? null : peek(storedGameRecordAtom(activeGameId))
    expect(activeGame).toEqual(
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
      goToGame: vi.fn(),
      goToGames: vi.fn(),
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
