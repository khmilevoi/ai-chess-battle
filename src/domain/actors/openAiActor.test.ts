import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  IllegalMoveError,
  OpenAiHttpError,
  OpenAiResponseError,
  OpenAiTransportError,
  TurnCancelledError,
} from '@/shared/errors'
import { AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS } from '@/actors/ai-actor'
import { createChessEngine } from '../chess/createChessEngine'
import type { ActorContext } from '../chess/types'

const openAiProviderMock = vi.hoisted(() => ({
  callOpenAi: vi.fn(),
}))

vi.mock('@/shared/ai-providers/openai', async () => {
  const actual = await vi.importActual<typeof import('@/shared/ai-providers/openai')>(
    '@/shared/ai-providers/openai',
  )

  return {
    ...actual,
    callOpenAi: openAiProviderMock.callOpenAi,
  }
})

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

async function flushMicrotask() {
  await Promise.resolve()
}

async function waitForMockCall(mock: { mock: { calls: Array<unknown> } }) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (mock.mock.calls.length > 0) {
      return
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  }

  throw new Error('Expected mock to be called.')
}

function createLegalMove() {
  return {
    from: 'e2',
    to: 'e4',
    promotion: 'null',
  } as const
}

function createIllegalMove() {
  return {
    from: 'e2',
    to: 'e5',
    promotion: 'null',
  } as const
}

describe('OpenAiActor', () => {
  const config = {
    apiKey: 'test-key',
    model: DEFAULT_OPENAI_MODEL,
    reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    openAiProviderMock.callOpenAi.mockReset()
  })

  it('returns provider transport errors as values', async () => {
    openAiProviderMock.callOpenAi.mockRejectedValue(
      new OpenAiTransportError({
        operation: 'request',
        cause: new Error('network down'),
      }),
    )

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

  it('retries once after a provider response mismatch and returns the legal move', async () => {
    openAiProviderMock.callOpenAi
      .mockRejectedValueOnce(
        new OpenAiResponseError({
          cause: new Error('OpenAI returned malformed JSON'),
        }),
      )
      .mockResolvedValueOnce(createLegalMove())

    const actor = OpenAiActor.create(config)

    if (!(actor instanceof OpenAiActorRuntime)) {
      throw actor
    }

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(openAiProviderMock.callOpenAi).toHaveBeenCalledTimes(2)
    expect(result).not.toBeInstanceOf(Error)

    if (result instanceof Error) {
      throw result
    }

    expect(result.uci).toBe('e2e4')
  })

  it('retries until the global attempt limit and then returns the invalid move error', async () => {
    for (let attempt = 0; attempt < AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS; attempt += 1) {
      openAiProviderMock.callOpenAi.mockResolvedValueOnce(createIllegalMove())
    }

    const actor = OpenAiActor.create(config)

    if (!(actor instanceof OpenAiActorRuntime)) {
      throw actor
    }

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(openAiProviderMock.callOpenAi).toHaveBeenCalledTimes(
      AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS,
    )
    expect(result).toBeInstanceOf(IllegalMoveError)
  })

  it('retries repeated provider requests without serializing retry history', async () => {
    openAiProviderMock.callOpenAi
      .mockResolvedValueOnce(createIllegalMove())
      .mockResolvedValueOnce(createIllegalMove())
      .mockResolvedValueOnce(createLegalMove())

    const actor = OpenAiActor.create(config)

    if (!(actor instanceof OpenAiActorRuntime)) {
      throw actor
    }

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(result).not.toBeInstanceOf(Error)
    expect(openAiProviderMock.callOpenAi).toHaveBeenCalledTimes(3)

    if (result instanceof Error) {
      throw result
    }

    expect(result.uci).toBe('e2e4')

    const inputs = openAiProviderMock.callOpenAi.mock.calls.map(
      (call) => JSON.parse(call[0].user) as Record<string, unknown>,
    )

    expect(inputs).toHaveLength(3)
    for (const input of inputs) {
      expect(input).not.toHaveProperty('errorStack')
    }
  })

  it('returns http errors without retrying', async () => {
    openAiProviderMock.callOpenAi.mockRejectedValue(
      new OpenAiHttpError({
        status: 401,
        cause: new Error('Unauthorized'),
      }),
    )

    const actor = OpenAiActor.create(config)

    if (!(actor instanceof OpenAiActorRuntime)) {
      throw actor
    }

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(openAiProviderMock.callOpenAi).toHaveBeenCalledTimes(1)
    expect(result).toBeInstanceOf(OpenAiHttpError)
  })

  it('passes reasoning and abort signal through to the provider call', async () => {
    let receivedSignal: AbortSignal | undefined
    let rejectCall: ((error: Error) => void) | null = null

    openAiProviderMock.callOpenAi.mockImplementation(
      ({ signal }: { signal?: AbortSignal }) =>
        new Promise((_, reject) => {
          receivedSignal = signal
          rejectCall = reject
        }),
    )

    const actor = OpenAiActor.create(config)

    if (!(actor instanceof OpenAiActorRuntime)) {
      throw actor
    }

    const controller = new AbortController()
    const resultPromise = actor.requestMove({
      context: createActorContext(),
      signal: controller.signal,
    })

    await waitForMockCall(openAiProviderMock.callOpenAi)

    expect(openAiProviderMock.callOpenAi).toHaveBeenCalledWith(
      expect.objectContaining({
        model: DEFAULT_OPENAI_MODEL,
        providerOptions: {
          reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
        },
        signal: controller.signal,
      }),
    )
    expect(receivedSignal).toBe(controller.signal)
    expect(receivedSignal?.aborted).toBe(false)

    controller.abort(new TurnCancelledError({ side: 'white' }))
    expect(receivedSignal?.aborted).toBe(true)

    const finishCall = rejectCall as ((error: Error) => void) | null

    if (!finishCall) {
      throw new Error('Expected provider call to be pending.')
    }

    finishCall(controller.signal.reason as Error)

    const result = await resultPromise
    expect(result).toBeInstanceOf(TurnCancelledError)
  })
})
