import { peek } from '@reatom/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_REASONING_EFFORT,
  OpenAiActorRuntime,
} from '@/actors/ai-actor/open-ai'
import { createDefaultSideConfig } from '@/actors/registry'
import type { MatchConfig } from '@/actors/registry'
import * as openAiProvider from '@/shared/ai-providers/openai'
import { ActorError } from '@/shared/errors'
import {
  clearStoredGameArchive,
  createStoredGame,
  setActiveGameId,
  storedGameRecordAtom,
  type StoredGameActorControls,
} from '@/shared/storage/gameSessionStorage'
import { lockVault, unlockVault } from '@/shared/storage/credentialVault'
import {
  DEFAULT_TEST_VAULT_SECRETS,
  TEST_MASTER_PASSWORD,
  setupTestVault,
} from '@/test/credentialVault'
import { createGameModel } from './model'

function createRequiredStoredGame(
  ...args: Parameters<typeof createStoredGame>
) {
  const game = createStoredGame(...args)

  if (game instanceof Error) {
    throw game
  }

  return game
}

async function flush(times = 1) {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  }
}

async function waitForCondition(
  predicate: () => boolean,
  attempts = 100,
) {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) {
      return
    }

    await flush()
  }

  throw new Error('Timed out while waiting for condition.')
}

function createOpenAiResponse(uci: string) {
  return new Response(
    JSON.stringify({
      output_text: JSON.stringify({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.slice(4) || 'null',
      }),
      output: [],
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  )
}

function createSavedGame({
  config,
  actorControls = {},
  moves = [],
  evaluations,
}: {
  config: MatchConfig
  actorControls?: StoredGameActorControls
  moves?: Array<string>
  evaluations?: Parameters<typeof createStoredGame>[0]['evaluations']
}) {
  const game = createRequiredStoredGame({ config, actorControls, moves, evaluations })
  setActiveGameId(game.id)
  return game
}

function getRequestedArbiterMoveNumbers() {
  return vi.mocked(openAiProvider.callOpenAi).mock.calls.map(([params]) => {
    const payload = JSON.parse(params.user) as { moveNumber: number }

    return payload.moveNumber
  })
}

function createHumanArbiterConfig(): MatchConfig {
  return {
    white: createDefaultSideConfig('human'),
    black: createDefaultSideConfig('human'),
    arbiter: {
      arbiterKey: 'openai',
      arbiterConfig: {
        model: 'gpt-5-nano',
      },
    },
  }
}

describe('createGameModel', () => {
  beforeEach(async () => {
    openAiProvider.resetOpenAiSdkCache()
    clearStoredGameArchive()
    window.localStorage.clear()
    await setupTestVault()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('starts from the latest saved position', async () => {
    const game = createSavedGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      moves: ['e2e4', 'e7e5'],
    })
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      gameId: game.id,
      leaveToSetup: vi.fn(),
      leaveToGames: vi.fn(),
    })

    const startResult = await model.startMatch()

    expect(startResult).toBeNull()
    expect(model.snapshot()?.history).toEqual(['e2e4', 'e7e5'])
    expect(model.historyCursor()).toBe(2)
    expect(model.isAtLatestMove()).toBe(true)
  })

  it('applies a human move and persists it into the same saved game', async () => {
    const game = createSavedGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
    })
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      gameId: game.id,
      leaveToSetup: vi.fn(),
      leaveToGames: vi.fn(),
    })

    expect(await model.startMatch()).toBeNull()

    model.clickSquare('e2')
    model.clickSquare('e4')
    await flush(2)

    expect(model.snapshot()?.history).toEqual(['e2e4'])
    expect(model.snapshot()?.turn).toBe('black')
    expect(peek(storedGameRecordAtom(game.id))?.moves).toEqual(['e2e4'])
  })

  it('aborts the pending turn on dispose and rejects stale human input', async () => {
    const game = createSavedGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
    })
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      gameId: game.id,
      leaveToSetup: vi.fn(),
      leaveToGames: vi.fn(),
    })

    expect(await model.startMatch()).toBeNull()

    const pendingActor = model.activeHumanActor()
    expect(pendingActor).not.toBeNull()

    model.dispose()
    const lateMoveResult = pendingActor?.submitMove({
      from: 'e2',
      to: 'e4',
      uci: 'e2e4',
    })
    await flush(2)

    expect(lateMoveResult).toBeInstanceOf(ActorError)
    expect(model.snapshot()).toBeNull()
    expect(model.phase()).toBe('pending')
  })

  it('retries after an actor error and continues the match', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock
      .mockResolvedValueOnce(
        new Response('unauthorized', {
          status: 401,
        }),
      )
      .mockResolvedValueOnce(createOpenAiResponse('e2e4'))

    const game = createSavedGame({
      config: {
        white: {
          actorKey: 'openai',
          actorConfig: {
            apiKey: 'sk-test',
            model: DEFAULT_OPENAI_MODEL,
            reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
          },
        },
        black: createDefaultSideConfig('human'),
      },
    })
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      gameId: game.id,
      leaveToSetup: vi.fn(),
      leaveToGames: vi.fn(),
    })

    expect(await model.startMatch()).toBeNull()
    await flush(4)

    expect(model.phase()).toBe('actorError')
    expect(model.runtimeError()).toBeInstanceOf(Error)

    model.retryTurn()
    await flush(4)

    expect(model.snapshot()?.history).toEqual(['e2e4'])
    expect(model.phase()).toBe('playing')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reactively recovers initialization after the vault unlocks', async () => {
    await setupTestVault({
      openai: DEFAULT_TEST_VAULT_SECRETS.openai,
    })
    lockVault()

    const game = createSavedGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: {
          actorKey: 'openai',
          actorConfig: {
            apiKey: 'sk-ignored-by-redaction',
            model: DEFAULT_OPENAI_MODEL,
            reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
          },
        },
      },
    })
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      gameId: game.id,
      leaveToSetup: vi.fn(),
      leaveToGames: vi.fn(),
    })

    expect(await model.startMatch()).toBeInstanceOf(Error)
    expect(model.snapshot()).toBeNull()
    expect(model.phase()).toBe('actorError')

    expect(await unlockVault(TEST_MASTER_PASSWORD)).toBeNull()
    await waitForCondition(() => model.snapshot() !== null && model.phase() === 'playing')

    expect(model.runtimeError()).toBeNull()
    expect(model.snapshot()?.turn).toBe('white')
    expect(model.activeHumanActor()).not.toBeNull()
  })

  it('pauses live play while reviewing history and resumes from the latest move', async () => {
    const game = createSavedGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      moves: ['e2e4', 'e7e5'],
    })
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      gameId: game.id,
      leaveToSetup: vi.fn(),
      leaveToGames: vi.fn(),
    })

    expect(await model.startMatch()).toBeNull()

    model.goToPreviousMove()
    await flush(2)

    expect(model.snapshot()?.history).toEqual(['e2e4'])
    expect(model.isAtLatestMove()).toBe(false)
    expect(model.canContinueFromCurrentMove()).toBe(false)
    expect(model.activeActorControls()).toBeNull()

    model.clickSquare('g1')
    model.clickSquare('f3')
    await flush(2)
    expect(model.snapshot()?.history).toEqual(['e2e4'])

    model.goToNextMove()
    await flush(2)

    expect(model.snapshot()?.history).toEqual(['e2e4', 'e7e5'])
    expect(model.isAtLatestMove()).toBe(true)

    model.clickSquare('g1')
    model.clickSquare('f3')
    await flush(2)

    expect(model.snapshot()?.history).toEqual(['e2e4', 'e7e5', 'g1f3'])
    expect(peek(storedGameRecordAtom(game.id))?.moves).toEqual([
      'e2e4',
      'e7e5',
      'g1f3',
    ])
  })

  it('waits for beforeRequestMove before calling requestMove', async () => {
    let releaseBeforeRequestMove: (() => void) | null = null
    const beforeRequestMove = vi
      .spyOn(OpenAiActorRuntime.prototype, 'beforeRequestMove')
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            releaseBeforeRequestMove = () => resolve(null)
          }),
      )
    const requestMove = vi
      .spyOn(OpenAiActorRuntime.prototype, 'requestMove')
      .mockResolvedValue({
        from: 'e2',
        to: 'e4',
        uci: 'e2e4',
      })

    const game = createSavedGame({
      config: {
        white: {
          actorKey: 'openai',
          actorConfig: {
            apiKey: 'sk-test',
            model: DEFAULT_OPENAI_MODEL,
            reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
          },
        },
        black: createDefaultSideConfig('human'),
      },
    })
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      gameId: game.id,
      leaveToSetup: vi.fn(),
      leaveToGames: vi.fn(),
    })

    expect(await model.startMatch()).toBeNull()
    expect(beforeRequestMove).toHaveBeenCalledTimes(1)
    expect(requestMove).not.toHaveBeenCalled()

    ;(releaseBeforeRequestMove as null | (() => void))?.()
    await flush(4)

    expect(requestMove).toHaveBeenCalledTimes(1)
    expect(model.snapshot()?.history).toEqual(['e2e4'])
  })

  it('moves active actor controls with the current side and hides them off-tail', async () => {
    let resolveFirstMove: ((response: Response) => void) | null = null
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirstMove = resolve
          }),
      )
      .mockImplementationOnce(() => new Promise(() => {}))

    const game = createSavedGame({
      config: {
        white: {
          actorKey: 'openai',
          actorConfig: {
            apiKey: 'sk-test',
            model: DEFAULT_OPENAI_MODEL,
            reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
          },
        },
        black: {
          actorKey: 'openai',
          actorConfig: {
            apiKey: 'sk-test',
            model: DEFAULT_OPENAI_MODEL,
            reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
          },
        },
      },
    })
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      gameId: game.id,
      leaveToSetup: vi.fn(),
      leaveToGames: vi.fn(),
    })

    expect(await model.startMatch()).toBeNull()
    expect(model.activeActorControls()?.side).toBe('white')

    await waitForCondition(() => resolveFirstMove !== null)
    ;(resolveFirstMove as null | ((response: Response) => void))?.(
      createOpenAiResponse('e2e4'),
    )
    await waitForCondition(() => model.activeActorControls()?.side === 'black')

    expect(model.activeActorControls()?.side).toBe('black')

    model.goToMove(0)
    await flush(2)

    expect(model.activeActorControls()).toBeNull()
  })

  it('exposes a shared actor panel and updates its representative side as turns change', async () => {
    let resolveFirstMove: ((response: Response) => void) | null = null
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirstMove = resolve
          }),
      )
      .mockImplementationOnce(() => new Promise(() => {}))

    const game = createSavedGame({
      config: {
        white: {
          actorKey: 'openai',
          actorConfig: {
            apiKey: 'sk-test',
            model: DEFAULT_OPENAI_MODEL,
            reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
          },
        },
        black: {
          actorKey: 'openai',
          actorConfig: {
            apiKey: 'sk-test',
            model: DEFAULT_OPENAI_MODEL,
            reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
          },
        },
      },
    })
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      gameId: game.id,
      leaveToSetup: vi.fn(),
      leaveToGames: vi.fn(),
    })

    expect(await model.startMatch()).toBeNull()
    expect(model.actorPanels()).toEqual([
      expect.objectContaining({
        panelKey: 'controls:openai',
        side: 'white',
        sides: ['white', 'black'],
        activeSide: 'white',
        displayName: 'OpenAI Actor',
        hasControls: true,
        isActive: true,
      }),
    ])

    await waitForCondition(() => resolveFirstMove !== null)
    ;(resolveFirstMove as null | ((response: Response) => void))?.(
      createOpenAiResponse('e2e4'),
    )
    await waitForCondition(() => model.actorPanels()[0]?.activeSide === 'black')

    expect(model.actorPanels()).toEqual([
      expect.objectContaining({
        side: 'black',
        sides: ['white', 'black'],
        activeSide: 'black',
        isActive: true,
      }),
    ])

    model.goToMove(0)
    await flush(2)

    expect(model.actorPanels()).toEqual([
      expect.objectContaining({
        side: 'white',
        activeSide: 'white',
        isActive: true,
      }),
    ])
  })

  it('derives separate match info entries for white and black even when the actor type matches', async () => {
    const game = createSavedGame({
      config: {
        white: {
          actorKey: 'openai',
          actorConfig: {
            apiKey: 'sk-white',
            model: DEFAULT_OPENAI_MODEL,
            reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
          },
        },
        black: {
          actorKey: 'openai',
          actorConfig: {
            apiKey: 'sk-black',
            model: 'custom-openai-model',
            reasoningEffort: 'medium',
          },
        },
      },
    })
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      gameId: game.id,
      leaveToSetup: vi.fn(),
      leaveToGames: vi.fn(),
    })

    expect(await model.startMatch()).toBeNull()
    expect(model.matchInfoEntries()).toEqual([
      expect.objectContaining({
        side: 'white',
        actorKey: 'openai',
        actorConfig: expect.objectContaining({
          apiKey: DEFAULT_TEST_VAULT_SECRETS.openai,
          model: DEFAULT_OPENAI_MODEL,
        }),
      }),
      expect.objectContaining({
        side: 'black',
        actorKey: 'openai',
        actorConfig: expect.objectContaining({
          apiKey: DEFAULT_TEST_VAULT_SECRETS.openai,
          model: 'custom-openai-model',
          reasoningEffort: 'medium',
        }),
      }),
    ])
  })

  it('shares wait-for-confirmation state across identical OpenAI actors and persists it', async () => {
    let resolveFirstMove: ((response: Response) => void) | null = null
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirstMove = resolve
          }),
      )
      .mockImplementationOnce(() => new Promise(() => {}))

    const game = createSavedGame({
      config: {
        white: {
          actorKey: 'openai',
          actorConfig: {
            apiKey: 'sk-test',
            model: DEFAULT_OPENAI_MODEL,
            reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
          },
        },
        black: {
          actorKey: 'openai',
          actorConfig: {
            apiKey: 'sk-test',
            model: DEFAULT_OPENAI_MODEL,
            reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
          },
        },
      },
    })
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      gameId: game.id,
      leaveToSetup: vi.fn(),
      leaveToGames: vi.fn(),
    })

    expect(await model.startMatch()).toBeNull()

    const whiteActor = model.actorPanels()[0]?.actor

    expect(whiteActor).toBeInstanceOf(OpenAiActorRuntime)

    if (!(whiteActor instanceof OpenAiActorRuntime)) {
      throw new Error('Expected OpenAI actor panel to expose OpenAiActorRuntime.')
    }

    whiteActor.setWaitForConfirmation(true)

    expect(peek(storedGameRecordAtom(game.id))?.actorControls).toEqual({
      openai: {
        waitForConfirmation: true,
      },
    })

    await waitForCondition(() => resolveFirstMove !== null)
    ;(resolveFirstMove as null | ((response: Response) => void))?.(
      createOpenAiResponse('e2e4'),
    )
    await waitForCondition(() => {
      const actor = model.actorPanels()[0]?.actor

      return (
        actor instanceof OpenAiActorRuntime &&
        model.actorPanels()[0]?.activeSide === 'black' &&
        actor.waitForConfirmation() &&
        actor.confirmationPending() !== null
      )
    })

    const blackActor = model.actorPanels()[0]?.actor

    expect(blackActor).toBeInstanceOf(OpenAiActorRuntime)

    if (!(blackActor instanceof OpenAiActorRuntime)) {
      throw new Error('Expected OpenAI actor panel to expose OpenAiActorRuntime.')
    }

    expect(blackActor.waitForConfirmation()).toBe(true)
    expect(blackActor.confirmationPending()).toEqual({
      params: { side: 'black' },
    })
  })

  it('continues the same pending turn when confirmation is disabled mid-request', async () => {
    const pendingResponses: Array<(response: Response) => void> = []
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          pendingResponses.push(resolve)
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const game = createSavedGame({
      config: {
        white: {
          actorKey: 'openai',
          actorConfig: {
            apiKey: 'sk-test',
            model: DEFAULT_OPENAI_MODEL,
            reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
          },
        },
        black: createDefaultSideConfig('human'),
      },
      actorControls: {
        openai: {
          waitForConfirmation: true,
        },
      },
    })
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      gameId: game.id,
      leaveToSetup: vi.fn(),
      leaveToGames: vi.fn(),
    })

    expect(await model.startMatch()).toBeNull()

    const actor = model.actorPanels()[0]?.actor

    expect(actor).toBeInstanceOf(OpenAiActorRuntime)

    if (!(actor instanceof OpenAiActorRuntime)) {
      throw new Error('Expected OpenAI actor panel to expose OpenAiActorRuntime.')
    }

    expect(actor.waitForConfirmation()).toBe(true)
    expect(actor.confirmationPending()).toEqual({
      params: { side: 'white' },
    })
    expect(fetchMock).not.toHaveBeenCalled()

    actor.setWaitForConfirmation(false)

    await waitForCondition(() => fetchMock.mock.calls.length === 1)

    expect(actor.waitForConfirmation()).toBe(false)
    expect(actor.confirmationPending()).toBeNull()
    expect(pendingResponses).toHaveLength(1)

    pendingResponses[0]?.(createOpenAiResponse('e2e4'))

    await waitForCondition(() => model.snapshot()?.history.length === 1)

    expect(model.snapshot()?.history).toEqual(['e2e4'])
    expect(model.snapshot()?.turn).toBe('black')
    expect(model.phase()).toBe('playing')
    expect(model.runtimeError()).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rehydrates persisted shared confirmation state for the same saved game', async () => {
    const game = createSavedGame({
      config: {
        white: {
          actorKey: 'openai',
          actorConfig: {
            apiKey: 'sk-test',
            model: DEFAULT_OPENAI_MODEL,
            reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
          },
        },
        black: {
          actorKey: 'openai',
          actorConfig: {
            apiKey: 'sk-test',
            model: DEFAULT_OPENAI_MODEL,
            reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
          },
        },
      },
      actorControls: {
        openai: {
          waitForConfirmation: true,
        },
      },
    })
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      gameId: game.id,
      leaveToSetup: vi.fn(),
      leaveToGames: vi.fn(),
    })

    expect(await model.startMatch()).toBeNull()

    const actor = model.actorPanels()[0]?.actor

    expect(actor).toBeInstanceOf(OpenAiActorRuntime)

    if (!(actor instanceof OpenAiActorRuntime)) {
      throw new Error('Expected OpenAI actor panel to expose OpenAiActorRuntime.')
    }

    expect(actor.waitForConfirmation()).toBe(true)
    expect(actor.confirmationPending()).toEqual({
      params: { side: 'white' },
    })
  })

  it('resolves the latest non-null evaluation at or before the current cursor', async () => {
    const firstEvaluation = {
      score: 18,
      comment: 'White claims the center.',
    }
    const thirdEvaluation = {
      score: 42,
      comment: 'White develops with tempo.',
    }
    const game = createSavedGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      moves: ['e2e4', 'e7e5', 'g1f3'],
      evaluations: [firstEvaluation, null, thirdEvaluation],
    })
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      gameId: game.id,
      leaveToSetup: vi.fn(),
      leaveToGames: vi.fn(),
    })

    expect(await model.startMatch()).toBeNull()

    expect(model.resolvedEvaluation()).toEqual({
      evaluation: thirdEvaluation,
      moveIndex: 2,
    })

    model.goToMove(2)
    await flush(2)

    expect(model.resolvedEvaluation()).toEqual({
      evaluation: firstEvaluation,
      moveIndex: 0,
    })

    model.goToMove(0)
    await flush(2)

    expect(model.resolvedEvaluation()).toBeNull()
  })

  it('requests a missing evaluation when the cursor visits that move', async () => {
    vi.spyOn(openAiProvider, 'callOpenAi').mockImplementation(
      () => new Promise(() => {}),
    )

    const game = createSavedGame({
      config: createHumanArbiterConfig(),
      moves: ['e2e4', 'e7e5'],
      evaluations: [
        null,
        {
          score: -12,
          comment: 'Black mirrors the center.',
        },
      ],
    })
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      gameId: game.id,
      leaveToSetup: vi.fn(),
      leaveToGames: vi.fn(),
    })

    expect(await model.startMatch()).toBeNull()
    await flush(2)

    expect(openAiProvider.callOpenAi).not.toHaveBeenCalled()

    model.goToMove(1)
    await waitForCondition(() => vi.mocked(openAiProvider.callOpenAi).mock.calls.length === 1)

    expect(getRequestedArbiterMoveNumbers()).toEqual([1])

    model.goToMove(2)
    await flush(2)

    expect(getRequestedArbiterMoveNumbers()).toEqual([1])
  })

  it('dedupes cursor-driven arbiter requests while a move is queued or in-flight', async () => {
    const pendingResponses: Array<(value: { score: number; comment: string }) => void> = []
    vi.spyOn(openAiProvider, 'callOpenAi').mockImplementation(
      () =>
        new Promise((resolve) => {
          pendingResponses.push(resolve)
        }),
    )

    const game = createSavedGame({
      config: createHumanArbiterConfig(),
      moves: ['e2e4', 'e7e5'],
      evaluations: [null, null],
    })
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      gameId: game.id,
      leaveToSetup: vi.fn(),
      leaveToGames: vi.fn(),
    })

    expect(await model.startMatch()).toBeNull()
    await waitForCondition(() => vi.mocked(openAiProvider.callOpenAi).mock.calls.length === 1)

    model.goToMove(1)
    await flush(2)
    model.goToMove(2)
    await flush(2)
    model.goToMove(1)
    await flush(2)

    expect(getRequestedArbiterMoveNumbers()).toEqual([2])

    pendingResponses[0]?.({
      score: -20,
      comment: 'Black has equalized.',
    })
    await waitForCondition(() => vi.mocked(openAiProvider.callOpenAi).mock.calls.length === 2)

    pendingResponses[1]?.({
      score: 16,
      comment: 'White starts actively.',
    })
    await waitForCondition(
      () => peek(storedGameRecordAtom(game.id))?.evaluations?.[0]?.score === 16,
    )
    await flush(4)

    expect(getRequestedArbiterMoveNumbers()).toEqual([2, 1])
  })

  it('queues arbiter evaluations after persisted moves through the cursor effect', async () => {
    let resolveEvaluation: ((value: { score: number; comment: string }) => void) | null = null
    vi.spyOn(openAiProvider, 'callOpenAi').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEvaluation = resolve
        }),
    )

    const game = createSavedGame({
      config: createHumanArbiterConfig(),
    })
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      gameId: game.id,
      leaveToSetup: vi.fn(),
      leaveToGames: vi.fn(),
    })

    expect(await model.startMatch()).toBeNull()

    model.clickSquare('e2')
    model.clickSquare('e4')
    await flush(2)

    const updatedAtAfterMove = peek(storedGameRecordAtom(game.id))?.updatedAt ?? null
    expect(resolveEvaluation).not.toBeNull()
    expect(model.currentMoveEvaluating()).toBe(true)
    expect(getRequestedArbiterMoveNumbers()).toEqual([1])

    const completeEvaluation: (value: { score: number; comment: string }) => void =
      resolveEvaluation ??
      (() => {
        throw new Error('Expected arbiter evaluation to be queued.')
      })

    completeEvaluation({
      score: 32,
      comment: 'White opens with purpose.',
    })

    await waitForCondition(
      () => peek(storedGameRecordAtom(game.id))?.evaluations?.[0]?.score === 32,
    )

    expect(model.resolvedEvaluation()).toEqual({
      evaluation: {
        score: 32,
        comment: 'White opens with purpose.',
      },
      moveIndex: 0,
    })
    expect(model.currentMoveEvaluating()).toBe(false)
    expect(peek(storedGameRecordAtom(game.id))?.updatedAt).toBe(updatedAtAfterMove)
  })

  it('persists null when an arbiter evaluation fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(openAiProvider, 'callOpenAi').mockRejectedValue(
      new openAiProvider.OpenAiTransportError({
        operation: 'request',
        cause: new Error('network down'),
      }),
    )

    const game = createSavedGame({
      config: createHumanArbiterConfig(),
    })
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      gameId: game.id,
      leaveToSetup: vi.fn(),
      leaveToGames: vi.fn(),
    })

    expect(await model.startMatch()).toBeNull()

    model.clickSquare('e2')
    model.clickSquare('e4')

    await waitForCondition(
      () => peek(storedGameRecordAtom(game.id))?.evaluations?.[0] === null,
    )

    expect(model.resolvedEvaluation()).toBeNull()
    await waitForCondition(() => !model.currentMoveEvaluating())
    expect(model.currentMoveEvaluating()).toBe(false)
  })

  it('retries a missing current-cursor evaluation when the vault unlocks', async () => {
    lockVault()

    let resolveEvaluation: ((value: { score: number; comment: string }) => void) | null = null
    vi.spyOn(openAiProvider, 'callOpenAi').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEvaluation = resolve
        }),
    )

    const game = createSavedGame({
      config: createHumanArbiterConfig(),
      moves: ['e2e4'],
      evaluations: [null],
    })
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      gameId: game.id,
      leaveToSetup: vi.fn(),
      leaveToGames: vi.fn(),
    })

    // Actors are human — game starts even with vault locked
    expect(await model.startMatch()).toBeNull()
    expect(model.phase()).toBe('playing')

    // Move 1: arbiter is unavailable stub (vault locked) → null evaluation
    expect(openAiProvider.callOpenAi).not.toHaveBeenCalled()
    expect(model.currentMoveEvaluating()).toBe(false)

    // Unlock vault → refreshArbiterOnVaultChange effect fires → arbiter rebuilt with real key
    expect(await unlockVault(TEST_MASTER_PASSWORD)).toBeNull()
    await waitForCondition(() => vi.mocked(openAiProvider.callOpenAi).mock.calls.length === 1)
    expect(getRequestedArbiterMoveNumbers()).toEqual([1])
    expect(model.currentMoveEvaluating()).toBe(true)

    // Move 2: real arbiter now active → provider is called
    expect(resolveEvaluation).not.toBeNull()
    resolveEvaluation!({ score: 64, comment: 'White starts cleanly.' })

    await waitForCondition(
      () => peek(storedGameRecordAtom(game.id))?.evaluations?.[0]?.score === 64,
    )

    expect(model.currentMoveEvaluating()).toBe(false)
  })

  it('reports evaluating only for the cursor current move', async () => {
    let resolveEvaluation: ((value: { score: number; comment: string }) => void) | null = null
    vi.spyOn(openAiProvider, 'callOpenAi').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEvaluation = resolve
        }),
    )

    const game = createSavedGame({
      config: createHumanArbiterConfig(),
      moves: ['e2e4', 'e7e5'],
      evaluations: [
        null,
        {
          score: -14,
          comment: 'Black answers symmetrically.',
        },
      ],
    })
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      gameId: game.id,
      leaveToSetup: vi.fn(),
      leaveToGames: vi.fn(),
    })

    expect(await model.startMatch()).toBeNull()

    model.goToMove(1)
    await waitForCondition(() => vi.mocked(openAiProvider.callOpenAi).mock.calls.length === 1)

    expect(model.currentMoveEvaluating()).toBe(true)

    model.goToMove(2)
    await flush(2)

    expect(model.currentMoveEvaluating()).toBe(false)

    resolveEvaluation!({
      score: 22,
      comment: 'White builds pressure.',
    })
    await waitForCondition(
      () => peek(storedGameRecordAtom(game.id))?.evaluations?.[0]?.score === 22,
    )

    expect(model.currentMoveEvaluating()).toBe(false)
  })
})
