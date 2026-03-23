import Anthropic, { APIError } from '@anthropic-ai/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AnthropicHttpError,
  AnthropicTransportError,
  IllegalMoveError,
  TurnCancelledError,
} from '@/shared/errors'
import { AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS } from '@/actors/ai-actor'
import { createChessEngine } from '../chess/createChessEngine'
import type { ActorContext } from '../chess/types'
import {
  AnthropicActor,
  AnthropicActorRuntime,
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

function createParsedResponse(payload: unknown) {
  return {
    parsed_output: payload,
  }
}

async function flushMicrotask() {
  await Promise.resolve()
}

describe('AnthropicActor', () => {
  const config = {
    apiKey: 'test-key',
    model: DEFAULT_ANTHROPIC_MODEL,
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns transport errors as values', async () => {
    const actor = AnthropicActor.create(config)

    if (!(actor instanceof AnthropicActorRuntime)) {
      throw actor
    }

    const client = Reflect.get(actor, 'client') as Anthropic
    vi.spyOn(client.messages, 'parse').mockRejectedValue(new Error('network down'))

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

  it('retries once after a schema mismatch and returns the legal move', async () => {
    const actor = AnthropicActor.create(config)

    if (!(actor instanceof AnthropicActorRuntime)) {
      throw actor
    }

    const client = Reflect.get(actor, 'client') as Anthropic
    const parseMock = vi
      .spyOn(client.messages, 'parse')
      .mockResolvedValueOnce(
        createParsedResponse({ from: 'e2', to: 'e4' }) as never,
      )
      .mockResolvedValueOnce(
        createParsedResponse({
          from: 'e2',
          to: 'e4',
          promotion: 'null',
        }) as never,
      )

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(parseMock).toHaveBeenCalledTimes(2)
    expect(result).not.toBeInstanceOf(Error)
    if (result instanceof Error) {
      throw result
    }

    expect(result.uci).toBe('e2e4')
  })

  it('retries until the global attempt limit and then returns the invalid move error', async () => {
    const actor = AnthropicActor.create(config)

    if (!(actor instanceof AnthropicActorRuntime)) {
      throw actor
    }

    const client = Reflect.get(actor, 'client') as Anthropic
    const parseMock = vi.spyOn(client.messages, 'parse')

    for (let attempt = 0; attempt < AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS; attempt += 1) {
      parseMock.mockResolvedValueOnce(
        createParsedResponse({
          from: 'e2',
          to: 'e5',
          promotion: 'null',
        }) as never,
      )
    }

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(parseMock).toHaveBeenCalledTimes(AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS)
    expect(result).toBeInstanceOf(IllegalMoveError)
  })

  it('passes the accumulated error stack in repeated sdk requests', async () => {
    const actor = AnthropicActor.create(config)

    if (!(actor instanceof AnthropicActorRuntime)) {
      throw actor
    }

    const client = Reflect.get(actor, 'client') as Anthropic
    const parseMock = vi
      .spyOn(client.messages, 'parse')
      .mockResolvedValueOnce(
        createParsedResponse({
          from: 'e2',
          to: 'e5',
          promotion: 'null',
        }) as never,
      )
      .mockResolvedValueOnce(
        createParsedResponse({
          from: 'e2',
          to: 'e5',
          promotion: 'null',
        }) as never,
      )
      .mockResolvedValueOnce(
        createParsedResponse({
          from: 'e2',
          to: 'e4',
          promotion: 'null',
        }) as never,
      )

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(result).not.toBeInstanceOf(Error)
    expect(parseMock).toHaveBeenCalledTimes(3)

    const firstInput = JSON.parse(parseMock.mock.calls[0][0].messages[0]?.content as string) as {
      errorStack: Array<{ index: number; name: string; message: string }>
    }
    const secondInput = JSON.parse(parseMock.mock.calls[1][0].messages[0]?.content as string) as {
      errorStack: Array<{ index: number; name: string; message: string }>
    }
    const thirdInput = JSON.parse(parseMock.mock.calls[2][0].messages[0]?.content as string) as {
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
    const actor = AnthropicActor.create(config)

    if (!(actor instanceof AnthropicActorRuntime)) {
      throw actor
    }

    const client = Reflect.get(actor, 'client') as Anthropic
    const parseMock = vi.spyOn(client.messages, 'parse').mockRejectedValue(
      new APIError(
        401,
        { type: 'error' } as Record<string, unknown>,
        'Unauthorized',
        new Headers(),
      ),
    )

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(parseMock).toHaveBeenCalledTimes(1)
    expect(result).toBeInstanceOf(AnthropicHttpError)
  })

  it('passes the abort signal to the SDK request options', async () => {
    const actor = AnthropicActor.create(config)

    if (!(actor instanceof AnthropicActorRuntime)) {
      throw actor
    }

    const controller = new AbortController()
    const client = Reflect.get(actor, 'client') as Anthropic
    const parseMock = vi
      .spyOn(client.messages, 'parse')
      .mockResolvedValue(
        createParsedResponse({
          from: 'e2',
          to: 'e4',
          promotion: 'null',
        }) as never,
      )

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: controller.signal,
    })

    expect(result).not.toBeInstanceOf(Error)
    expect(parseMock).toHaveBeenCalledTimes(1)
    expect(parseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: DEFAULT_ANTHROPIC_MODEL,
      }),
      {
        signal: controller.signal,
      },
    )
  })
})
