import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_REASONING_EFFORT,
} from '../../actors/openai'
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
