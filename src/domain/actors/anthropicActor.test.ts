import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AnthropicHttpError,
  AnthropicResponseError,
  AnthropicTransportError,
  IllegalMoveError,
  TurnCancelledError,
} from '@/shared/errors'
import { AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS } from '@/actors/ai-actor'
import { createChessEngine } from '../chess/createChessEngine'
import type { ActorContext } from '../chess/types'

const anthropicProviderMock = vi.hoisted(() => ({
  callAnthropic: vi.fn(),
}))

vi.mock('@/shared/ai-providers/anthropic', async () => {
  const actual = await vi.importActual<typeof import('@/shared/ai-providers/anthropic')>(
    '@/shared/ai-providers/anthropic',
  )

  return {
    ...actual,
    callAnthropic: anthropicProviderMock.callAnthropic,
  }
})

import {
  AnthropicActor,
  AnthropicActorRuntime,
  DEFAULT_ANTHROPIC_EFFORT,
  DEFAULT_ANTHROPIC_MODEL,
} from '@/actors/ai-actor/anthropic'

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

describe('AnthropicActor', () => {
  const config = {
    apiKey: 'test-key',
    effort: DEFAULT_ANTHROPIC_EFFORT,
    model: DEFAULT_ANTHROPIC_MODEL,
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    anthropicProviderMock.callAnthropic.mockReset()
  })

  it('returns provider transport errors as values', async () => {
    anthropicProviderMock.callAnthropic.mockRejectedValue(
      new AnthropicTransportError({
        operation: 'request',
        cause: new Error('network down'),
      }),
    )

    const actor = AnthropicActor.create(config)

    if (!(actor instanceof AnthropicActorRuntime)) {
      throw actor
    }

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(result).toBeInstanceOf(AnthropicTransportError)
  })

  it('does not wait for confirmation by default', async () => {
    const actor = AnthropicActor.create(config)

    if (!(actor instanceof AnthropicActorRuntime)) {
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
    const actor = AnthropicActor.create(config)

    if (!(actor instanceof AnthropicActorRuntime)) {
      throw actor
    }

    actor.setWaitForConfirmation(true)

    let settled = false
    const pendingConfirmation = actor.beforeRequestMove?.({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    if (!pendingConfirmation) {
      throw new Error('Anthropic actor is missing beforeRequestMove')
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
    const actor = AnthropicActor.create(config)

    if (!(actor instanceof AnthropicActorRuntime)) {
      throw actor
    }

    actor.setWaitForConfirmation(true)
    const controller = new AbortController()
    const pendingConfirmation = actor.beforeRequestMove?.({
      context: createActorContext(),
      signal: controller.signal,
    })

    if (!pendingConfirmation) {
      throw new Error('Anthropic actor is missing beforeRequestMove')
    }

    controller.abort(new TurnCancelledError({ side: 'white' }))

    const result = await pendingConfirmation
    expect(result).toBeInstanceOf(TurnCancelledError)
    expect(actor.confirmationPending()).toBeNull()
  })

  it('retries once after a provider response mismatch and returns the legal move', async () => {
    anthropicProviderMock.callAnthropic
      .mockRejectedValueOnce(
        new AnthropicResponseError({
          cause: new Error('Anthropic returned malformed output'),
        }),
      )
      .mockResolvedValueOnce(createLegalMove())

    const actor = AnthropicActor.create(config)

    if (!(actor instanceof AnthropicActorRuntime)) {
      throw actor
    }

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(anthropicProviderMock.callAnthropic).toHaveBeenCalledTimes(2)
    expect(result).not.toBeInstanceOf(Error)

    if (result instanceof Error) {
      throw result
    }

    expect(result.uci).toBe('e2e4')
  })

  it('retries until the global attempt limit and then returns the invalid move error', async () => {
    for (let attempt = 0; attempt < AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS; attempt += 1) {
      anthropicProviderMock.callAnthropic.mockResolvedValueOnce(createIllegalMove())
    }

    const actor = AnthropicActor.create(config)

    if (!(actor instanceof AnthropicActorRuntime)) {
      throw actor
    }

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(anthropicProviderMock.callAnthropic).toHaveBeenCalledTimes(
      AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS,
    )
    expect(result).toBeInstanceOf(IllegalMoveError)
  })

  it('passes the accumulated error stack in repeated provider requests', async () => {
    anthropicProviderMock.callAnthropic
      .mockResolvedValueOnce(createIllegalMove())
      .mockResolvedValueOnce(createIllegalMove())
      .mockResolvedValueOnce(createLegalMove())

    const actor = AnthropicActor.create(config)

    if (!(actor instanceof AnthropicActorRuntime)) {
      throw actor
    }

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(result).not.toBeInstanceOf(Error)
    expect(anthropicProviderMock.callAnthropic).toHaveBeenCalledTimes(3)

    const firstInput = JSON.parse(anthropicProviderMock.callAnthropic.mock.calls[0]![0].user) as {
      errorStack: Array<{ index: number; name: string; message: string }>
    }
    const secondInput = JSON.parse(anthropicProviderMock.callAnthropic.mock.calls[1]![0].user) as {
      errorStack: Array<{ index: number; name: string; message: string }>
    }
    const thirdInput = JSON.parse(anthropicProviderMock.callAnthropic.mock.calls[2]![0].user) as {
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
    anthropicProviderMock.callAnthropic.mockRejectedValue(
      new AnthropicHttpError({
        status: 401,
        cause: new Error('Unauthorized'),
      }),
    )

    const actor = AnthropicActor.create(config)

    if (!(actor instanceof AnthropicActorRuntime)) {
      throw actor
    }

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(anthropicProviderMock.callAnthropic).toHaveBeenCalledTimes(1)
    expect(result).toBeInstanceOf(AnthropicHttpError)
  })

  it('passes adaptive thinking and effort to Claude Sonnet 4.6 provider requests', async () => {
    anthropicProviderMock.callAnthropic.mockResolvedValue(createLegalMove())

    const actor = AnthropicActor.create(config)

    if (!(actor instanceof AnthropicActorRuntime)) {
      throw actor
    }

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(result).not.toBeInstanceOf(Error)
    expect(anthropicProviderMock.callAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        model: DEFAULT_ANTHROPIC_MODEL,
        providerOptions: {
          effort: DEFAULT_ANTHROPIC_EFFORT,
          thinking: 'adaptive',
        },
      }),
    )
  })

  it('passes xhigh effort for Claude Opus 4.7 requests', async () => {
    anthropicProviderMock.callAnthropic.mockResolvedValue(createLegalMove())

    const actor = AnthropicActor.create({
      ...config,
      model: 'claude-opus-4-7',
      effort: 'xhigh',
    })

    if (!(actor instanceof AnthropicActorRuntime)) {
      throw actor
    }

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(result).not.toBeInstanceOf(Error)
    expect(anthropicProviderMock.callAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-4-7',
        providerOptions: {
          effort: 'xhigh',
          thinking: 'adaptive',
        },
      }),
    )
  })

  it('omits effort and adaptive thinking for Claude Haiku 4.5 requests', async () => {
    anthropicProviderMock.callAnthropic.mockResolvedValue(createLegalMove())

    const actor = AnthropicActor.create({
      ...config,
      model: 'claude-haiku-4-5',
      effort: 'max',
    })

    if (!(actor instanceof AnthropicActorRuntime)) {
      throw actor
    }

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(result).not.toBeInstanceOf(Error)
    expect(anthropicProviderMock.callAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5',
        providerOptions: {
          effort: undefined,
          thinking: undefined,
        },
      }),
    )
  })
})
