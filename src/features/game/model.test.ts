import { peek } from '@reatom/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_REASONING_EFFORT,
  OpenAiActorRuntime,
} from '../../actors/ai-actor/open-ai'
import { createDefaultSideConfig } from '../../actors/registry'
import type { MatchConfig } from '../../actors/registry'
import { ActorError } from '../../shared/errors'
import {
  clearStoredGameArchive,
  createStoredGame,
  setActiveGameId,
  storedGameRecordAtom,
} from '../../shared/storage/gameSessionStorage'
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
  moves = [],
}: {
  config: MatchConfig
  moves?: Array<string>
}) {
  const game = createRequiredStoredGame({ config, moves })
  setActiveGameId(game.id)
  return game
}

describe('createGameModel', () => {
  beforeEach(() => {
    clearStoredGameArchive()
    window.localStorage.clear()
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

  it('exposes both actor panels and updates the active side as turns change', async () => {
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
        side: 'white',
        displayName: 'OpenAI Actor',
        hasControls: true,
        isActive: true,
      }),
      expect.objectContaining({
        side: 'black',
        displayName: 'OpenAI Actor',
        hasControls: true,
        isActive: false,
      }),
    ])

    await waitForCondition(() => resolveFirstMove !== null)
    ;(resolveFirstMove as null | ((response: Response) => void))?.(
      createOpenAiResponse('e2e4'),
    )
    await waitForCondition(() =>
      model.actorPanels().some((actorPanel) => actorPanel.side === 'black' && actorPanel.isActive),
    )

    expect(model.actorPanels()).toEqual([
      expect.objectContaining({
        side: 'white',
        isActive: false,
      }),
      expect.objectContaining({
        side: 'black',
        isActive: true,
      }),
    ])

    model.goToMove(0)
    await flush(2)

    expect(model.actorPanels()).toEqual([
      expect.objectContaining({
        side: 'white',
        isActive: true,
      }),
      expect.objectContaining({
        side: 'black',
        isActive: false,
      }),
    ])
  })
})
