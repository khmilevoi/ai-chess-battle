import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPENAI_MODEL } from '../../actors/openai'
import { createDefaultSideConfig } from '../../actors/registry'
import type { MatchConfig } from '../../actors/registry'
import { ActorError } from '../../shared/errors'
import { createGameModel } from './model'

async function flush(times = 1) {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  }
}

describe('createGameModel', () => {
  beforeEach(() => {
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
        },
      },
      black: createDefaultSideConfig('human'),
    }

    const model = createGameModel({
      name: `test-game-${crypto.randomUUID()}`,
      config,
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
  })
})
