import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_REASONING_EFFORT,
} from '../../actors/openai'
import { OpenAiActorRuntime } from '../../actors/openai/model'
import { createDefaultSideConfig } from '../../actors/registry'
import type { MatchConfig } from '../../actors/registry'
import { ActorError } from '../../shared/errors'
import {
  clearStoredGameSession,
  createStoredGameSession,
} from '../../shared/storage/gameSessionStorage'
import { createGameModel } from './model'

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

describe('createGameModel', () => {
  beforeEach(() => {
    clearStoredGameSession()
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('starts from the provided match config', async () => {
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      initialSession: null,
      leaveToSetup: vi.fn(),
    })

    const startResult = await model.startMatch()

    expect(startResult).toBeNull()
    expect(model.snapshot()).not.toBeNull()
    expect(model.phase()).toBe('playing')
  })

  it('applies a human move and advances the turn', async () => {
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      initialSession: null,
      leaveToSetup: vi.fn(),
    })

    const startResult = await model.startMatch()

    expect(startResult).toBeNull()

    model.clickSquare('e2')
    model.clickSquare('e4')
    await flush(2)

    const snapshot = model.snapshot()
    expect(snapshot?.history).toEqual(['e2e4'])
    expect(snapshot?.turn).toBe('black')
    expect(model.phase()).toBe('playing')
  })

  it('aborts the pending turn on dispose and rejects stale human input', async () => {
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      initialSession: null,
      leaveToSetup: vi.fn(),
    })

    const startResult = await model.startMatch()

    expect(startResult).toBeNull()

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
        new Response(
          JSON.stringify({
            output_text: '{"from":"a1","to":"a2","promotion":"null"}',
            output: [],
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output_text: '{"from":"a1","to":"a2","promotion":"null"}',
            output: [],
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output_text: '{"from":"e2","to":"e4","promotion":"null"}',
            output: [],
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      )

    const config: MatchConfig = {
      white: {
        actorKey: 'openai',
        actorConfig: {
          apiKey: 'sk-test',
          model: DEFAULT_OPENAI_MODEL,
          reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
        },
      },
      black: createDefaultSideConfig('human'),
    }

    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      config,
      initialSession: null,
      leaveToSetup: vi.fn(),
    })

    const startResult = await model.startMatch()

    expect(startResult).toBeNull()

    await flush(4)

    expect(model.phase()).toBe('actorError')
    expect(model.runtimeError()).toBeInstanceOf(Error)

    void model.retryTurn()

    await flush(4)

    const snapshot = model.snapshot()
    expect(snapshot?.history).toEqual(['e2e4'])
    expect(snapshot?.turn).toBe('black')
    expect(model.phase()).toBe('playing')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('ignores repeated retryTurn calls once the loop restarts', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output_text: '{"from":"a1","to":"a2","promotion":"null"}',
            output: [],
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output_text: '{"from":"a1","to":"a2","promotion":"null"}',
            output: [],
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(createOpenAiResponse('e2e4'))

    const config: MatchConfig = {
      white: {
        actorKey: 'openai',
        actorConfig: {
          apiKey: 'sk-test',
          model: DEFAULT_OPENAI_MODEL,
          reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
        },
      },
      black: createDefaultSideConfig('human'),
    }

    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      config,
      initialSession: null,
      leaveToSetup: vi.fn(),
    })

    expect(await model.startMatch()).toBeNull()
    await flush(4)

    expect(model.phase()).toBe('actorError')

    model.retryTurn()
    model.retryTurn()

    await flush(4)

    expect(model.snapshot()?.history).toEqual(['e2e4'])
    expect(model.phase()).toBe('playing')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('continues bot versus bot matches after the first move', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock
      .mockResolvedValueOnce(createOpenAiResponse('e2e4'))
      .mockResolvedValueOnce(createOpenAiResponse('e7e5'))
      .mockImplementationOnce(() => new Promise(() => {}))

    const config: MatchConfig = {
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
    }

    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      config,
      initialSession: null,
      leaveToSetup: vi.fn(),
    })

    const startResult = await model.startMatch()

    expect(startResult).toBeNull()

    await flush(4)

    const snapshot = model.snapshot()
    expect(snapshot?.history.slice(0, 2)).toEqual(['e2e4', 'e7e5'])
    expect(snapshot?.turn).toBe('white')
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)

    model.dispose()
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

    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
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
      initialSession: null,
      leaveToSetup: vi.fn(),
    })

    expect(await model.startMatch()).toBeNull()
    expect(beforeRequestMove).toHaveBeenCalledTimes(1)
    expect(requestMove).not.toHaveBeenCalled()

    ;(releaseBeforeRequestMove as null | (() => void))?.()
    await flush(4)

    expect(requestMove).toHaveBeenCalledTimes(1)
    expect(model.snapshot()?.history).toEqual(['e2e4'])
    expect(model.snapshot()?.turn).toBe('black')
  })

  it('moves active actor controls to the side whose turn is current', async () => {
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

    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
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
      initialSession: null,
      leaveToSetup: vi.fn(),
    })

    expect(await model.startMatch()).toBeNull()
    expect(model.activeActorControls()?.side).toBe('white')

    await waitForCondition(() => resolveFirstMove !== null)
    ;(resolveFirstMove as null | ((response: Response) => void))?.(
      createOpenAiResponse('e2e4'),
    )
    await waitForCondition(() => model.activeActorControls()?.side === 'black')

    expect(model.activeActorControls()?.side).toBe('black')

    model.dispose()
  })

  it('replays a stored session and continues from the restored position', async () => {
    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      initialSession: createStoredGameSession({
        config: {
          white: createDefaultSideConfig('human'),
          black: createDefaultSideConfig('human'),
        },
        moves: ['e2e4', 'e7e5'],
      }),
      leaveToSetup: vi.fn(),
    })

    const startResult = await model.startMatch()

    expect(startResult).toBeNull()
    expect(model.snapshot()?.history).toEqual(['e2e4', 'e7e5'])
    expect(model.snapshot()?.turn).toBe('white')
  })
})
