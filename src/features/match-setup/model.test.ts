import { peek } from '@reatom/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPENAI_REASONING_EFFORT } from '@/actors/ai-actor/open-ai'
import { createDefaultSideConfig } from '@/actors/registry'
import type { MatchConfig } from '@/actors/registry'
import {
  clearStoredActorConfigMap,
  loadStoredActorConfig,
} from '@/shared/storage/actorConfigStorage'
import {
  lockVault,
  resetVault,
  setSecret,
  setupVault,
  unlockVault,
} from '@/shared/storage/credentialVault'
import {
  activeGameIdAtom,
  clearStoredGameArchive,
  storedGameRecordAtom,
} from '@/shared/storage/gameSessionStorage'
import {
  loadStoredMatchConfig,
  storedMatchConfig,
} from '@/shared/storage/matchConfigStorage'
import { setupTestVault, TEST_MASTER_PASSWORD } from '@/test/credentialVault'
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
    storedMatchConfig.clear()
    clearStoredGameArchive()
    window.localStorage.clear()
    resetVault()
  })

  it('hydrates the model from config loaded from storage', async () => {
    await setupTestVault()

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

    storedMatchConfig.save(storedConfig)

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

  it('reactively revalidates an AI side when the vault unlocks', async () => {
    expect(await setupVault(TEST_MASTER_PASSWORD)).toBeNull()
    expect(await setSecret('openai', 'sk-reactive-unlock')).toBeNull()
    lockVault()

    const model = createMatchSetupModel({
      name: `test-setup-${crypto.randomUUID()}`,
      initialConfig: {
        white: createDefaultSideConfig('openai'),
        black: createDefaultSideConfig('human'),
      },
      goToGame: vi.fn(),
      goToGames: vi.fn(),
    })

    expect(model.whiteValidation().error).toBeInstanceOf(Error)
    expect(model.canStart()).toBe(false)

    expect(await unlockVault(TEST_MASTER_PASSWORD)).toBeNull()

    expect(model.whiteValidation().error).toBeNull()
    const whiteSideConfig = model.whiteSideConfig()

    expect(whiteSideConfig.actorKey).toBe('openai')

    if (whiteSideConfig.actorKey !== 'openai') {
      throw new Error('Expected the white side to remain configured as OpenAI.')
    }

    expect(whiteSideConfig.actorConfig.apiKey).toBe('sk-reactive-unlock')
    expect(model.canStart()).toBe(true)
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

  it('keeps shared actor config synchronized between both sides', async () => {
    await setupTestVault({
      openai: 'sk-shared',
    })

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
