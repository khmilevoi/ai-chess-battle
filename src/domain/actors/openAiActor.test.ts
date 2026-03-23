import { beforeEach, describe, expect, it, vi } from 'vitest'
import OpenAI from 'openai'
import type { Response as OpenAiResponse } from 'openai/resources/responses/responses'
import {
  IllegalMoveError,
  OpenAiHttpError,
  OpenAiTransportError,
  TurnCancelledError,
} from '@/shared/errors'
import { AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS } from '@/actors/ai-actor'
import { createChessEngine } from '../chess/createChessEngine'
import type { ActorContext } from '../chess/types'
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_REASONING_EFFORT,
  OpenAiActor,
  OpenAiActorRuntime,
} from '@/actors/ai-actor/open-ai'

function createActorContext(): ActorContext {
  const engine = createChessEngine()

  if (engine instanceof Error) {
    throw engine
  }

  const snapshot = engine.getBoardSnapshot()
  const legalMovesBySquare = Object.fromEntries(
    engine
      .getMovablePieces(snapshot.turn)
      .map((square) => [square, engine.getLegalMoves(square)]),
  )

  return {
    side: snapshot.turn,
    snapshot,
    legalMovesBySquare,
    moveCount: snapshot.history.length,
  }
}

function createSuccessResponse(payload: string) {
  return new Response(
    JSON.stringify({
      output_text: payload,
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

async function flushMicrotask() {
  await Promise.resolve()
}

describe('OpenAiActor', () => {
  const config = {
    apiKey: 'test-key',
    model: DEFAULT_OPENAI_MODEL,
    reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns transport errors as values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const actor = OpenAiActor.create(config)

    if (!(actor instanceof OpenAiActorRuntime)) {
      throw actor
    }

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(result).toBeInstanceOf(OpenAiTransportError)
  })

  it('does not wait for confirmation by default', async () => {
    const actor = OpenAiActor.create(config)

    if (!(actor instanceof OpenAiActorRuntime)) {
      throw actor
    }

    expect(actor.waitForConfirmation()).toBe(false)
    expect(actor.confirmationPending()).toBeNull()
    expect(
      await actor.beforeRequestMove?.({
        context: createActorContext(),
        signal: new AbortController().signal,
      }),
    ).toBeNull()
  })

  it('waits for confirmation until confirmMoveRequest releases the gate', async () => {
    const actor = OpenAiActor.create(config)

    if (!(actor instanceof OpenAiActorRuntime)) {
      throw actor
    }

    actor.setWaitForConfirmation(true)

    let settled = false
    const pendingConfirmation = actor.beforeRequestMove?.({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    if (!pendingConfirmation) {
      throw new Error('OpenAI actor is missing beforeRequestMove')
    }

    const trackedConfirmation = pendingConfirmation.then((result) => {
      settled = true
      return result
    })

    await flushMicrotask()

    expect(settled).toBe(false)
    expect(actor.confirmationPending()).toEqual({
      params: { side: 'white' },
    })

    expect(actor.confirmMoveRequest()).toBeNull()
    expect(await trackedConfirmation).toBeNull()
    expect(actor.confirmationPending()).toBeNull()
  })

  it('returns cancellation when confirmation wait is aborted', async () => {
    const actor = OpenAiActor.create(config)

    if (!(actor instanceof OpenAiActorRuntime)) {
      throw actor
    }

    actor.setWaitForConfirmation(true)
    const controller = new AbortController()
    const pendingConfirmation = actor.beforeRequestMove?.({
      context: createActorContext(),
      signal: controller.signal,
    })

    if (!pendingConfirmation) {
      throw new Error('OpenAI actor is missing beforeRequestMove')
    }

    controller.abort(new TurnCancelledError({ side: 'white' }))

    const result = await pendingConfirmation
    expect(result).toBeInstanceOf(TurnCancelledError)
    expect(actor.confirmationPending()).toBeNull()
  })

  it('releases a pending confirmation when waiting is disabled mid-turn', async () => {
    const actor = OpenAiActor.create(config)

    if (!(actor instanceof OpenAiActorRuntime)) {
      throw actor
    }

    actor.setWaitForConfirmation(true)
    const pendingConfirmation = actor.beforeRequestMove?.({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    if (!pendingConfirmation) {
      throw new Error('OpenAI actor is missing beforeRequestMove')
    }

    await flushMicrotask()

    actor.setWaitForConfirmation(false)

    expect(await pendingConfirmation).toBeNull()
    expect(actor.waitForConfirmation()).toBe(false)
    expect(actor.confirmationPending()).toBeNull()
  })

  it('retries once after a schema mismatch and returns the legal move', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createSuccessResponse('{"from":"e2","to":"e4"}'))
      .mockResolvedValueOnce(
        createSuccessResponse('{"from":"e2","to":"e4","promotion":"null"}'),
      )
    vi.stubGlobal('fetch', fetchMock)
    const actor = OpenAiActor.create(config)

    if (!(actor instanceof OpenAiActorRuntime)) {
      throw actor
    }

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result).not.toBeInstanceOf(Error)
    if (result instanceof Error) {
      throw result
    }

    expect(result.uci).toBe('e2e4')
  })

  it('retries until the global attempt limit and then returns the invalid move error', async () => {
    const fetchMock = vi.fn()

    for (let attempt = 0; attempt < AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS; attempt += 1) {
      fetchMock.mockResolvedValueOnce(
        createSuccessResponse('{"from":"e2","to":"e5","promotion":"null"}'),
      )
    }

    vi.stubGlobal('fetch', fetchMock)
    const actor = OpenAiActor.create(config)

    if (!(actor instanceof OpenAiActorRuntime)) {
      throw actor
    }

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(fetchMock).toHaveBeenCalledTimes(AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS)
    expect(result).toBeInstanceOf(IllegalMoveError)
  })

  it('passes the accumulated error stack in repeated sdk requests', async () => {
    const actor = OpenAiActor.create(config)

    if (!(actor instanceof OpenAiActorRuntime)) {
      throw actor
    }

    const client = Reflect.get(actor, 'client') as OpenAI
    const createMock = vi
      .spyOn(client.responses, 'create')
      .mockResolvedValueOnce({
        output_text: '{"from":"e2","to":"e5","promotion":"null"}',
        output: [],
      } as unknown as OpenAiResponse)
      .mockResolvedValueOnce({
        output_text: '{"from":"e2","to":"e5","promotion":"null"}',
        output: [],
      } as unknown as OpenAiResponse)
      .mockResolvedValueOnce({
        output_text: '{"from":"e2","to":"e4","promotion":"null"}',
        output: [],
      } as unknown as OpenAiResponse)

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(result).not.toBeInstanceOf(Error)
    expect(createMock).toHaveBeenCalledTimes(3)

    const firstInput = JSON.parse(createMock.mock.calls[0][0].input as string) as {
      errorStack: Array<{ index: number; name: string; message: string }>
    }
    const secondInput = JSON.parse(createMock.mock.calls[1][0].input as string) as {
      errorStack: Array<{ index: number; name: string; message: string }>
    }
    const thirdInput = JSON.parse(createMock.mock.calls[2][0].input as string) as {
      errorStack: Array<{ index: number; name: string; message: string }>
    }

    expect(firstInput.errorStack).toEqual([])
    expect(secondInput.errorStack).toEqual([
      {
        index: 1,
        name: 'IllegalMoveError',
        message: 'Illegal move e2e5',
      },
    ])
    expect(thirdInput.errorStack).toEqual([
      {
        index: 1,
        name: 'IllegalMoveError',
        message: 'Illegal move e2e5',
      },
      {
        index: 2,
        name: 'IllegalMoveError',
        message: 'Illegal move e2e5',
      },
    ])
  })

  it('returns http errors without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('nope', {
        status: 401,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const actor = OpenAiActor.create(config)

    if (!(actor instanceof OpenAiActorRuntime)) {
      throw actor
    }

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).toBeInstanceOf(OpenAiHttpError)
  })

  it('passes the abort signal to the SDK request options', async () => {
    const actor = OpenAiActor.create(config)

    if (!(actor instanceof OpenAiActorRuntime)) {
      throw actor
    }

    const controller = new AbortController()
    const client = Reflect.get(actor, 'client') as OpenAI
    const createMock = vi
      .spyOn(client.responses, 'create')
      .mockResolvedValue({
        output_text: '{"from":"e2","to":"e4","promotion":"null"}',
        output: [],
      } as unknown as OpenAiResponse)

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: controller.signal,
    })

    expect(result).not.toBeInstanceOf(Error)
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: DEFAULT_OPENAI_MODEL,
        reasoning: { effort: DEFAULT_OPENAI_REASONING_EFFORT },
      }),
      {
        signal: controller.signal,
      },
    )
  })
})
