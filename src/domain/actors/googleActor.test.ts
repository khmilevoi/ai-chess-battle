import { ApiError, GoogleGenAI } from '@google/genai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GoogleGenAiHttpError,
  GoogleGenAiTransportError,
  IllegalMoveError,
  TurnCancelledError,
} from '@/shared/errors'
import { AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS } from '@/actors/ai-actor'
import { createChessEngine } from '../chess/createChessEngine'
import type { ActorContext } from '../chess/types'
import {
  DEFAULT_GOOGLE_MODEL,
  GoogleActor,
  GoogleActorRuntime,
} from '@/actors/ai-actor/google'

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

function createResponse(text?: string) {
  return { text }
}

async function flushMicrotask() {
  await Promise.resolve()
}

describe('GoogleActor', () => {
  const config = {
    apiKey: 'test-key',
    model: DEFAULT_GOOGLE_MODEL,
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns transport errors as values', async () => {
    const actor = GoogleActor.create(config)

    if (!(actor instanceof GoogleActorRuntime)) {
      throw actor
    }

    const client = Reflect.get(actor, 'client') as GoogleGenAI
    vi.spyOn(client.models, 'generateContent').mockRejectedValue(
      new Error('network down'),
    )

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(result).toBeInstanceOf(GoogleGenAiTransportError)
  })

  it('does not wait for confirmation by default', async () => {
    const actor = GoogleActor.create(config)

    if (!(actor instanceof GoogleActorRuntime)) {
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
    const actor = GoogleActor.create(config)

    if (!(actor instanceof GoogleActorRuntime)) {
      throw actor
    }

    actor.setWaitForConfirmation(true)

    let settled = false
    const pendingConfirmation = actor.beforeRequestMove?.({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    if (!pendingConfirmation) {
      throw new Error('Google actor is missing beforeRequestMove')
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
    const actor = GoogleActor.create(config)

    if (!(actor instanceof GoogleActorRuntime)) {
      throw actor
    }

    actor.setWaitForConfirmation(true)
    const controller = new AbortController()
    const pendingConfirmation = actor.beforeRequestMove?.({
      context: createActorContext(),
      signal: controller.signal,
    })

    if (!pendingConfirmation) {
      throw new Error('Google actor is missing beforeRequestMove')
    }

    controller.abort(new TurnCancelledError({ side: 'white' }))

    const result = await pendingConfirmation
    expect(result).toBeInstanceOf(TurnCancelledError)
    expect(actor.confirmationPending()).toBeNull()
  })

  it('retries once after a schema mismatch and returns the legal move', async () => {
    const actor = GoogleActor.create(config)

    if (!(actor instanceof GoogleActorRuntime)) {
      throw actor
    }

    const client = Reflect.get(actor, 'client') as GoogleGenAI
    const generateContentMock = vi
      .spyOn(client.models, 'generateContent')
      .mockResolvedValueOnce(createResponse('{"from":"e2","to":"e4"}') as never)
      .mockResolvedValueOnce(
        createResponse('{"from":"e2","to":"e4","promotion":"null"}') as never,
      )

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(generateContentMock).toHaveBeenCalledTimes(2)
    expect(result).not.toBeInstanceOf(Error)
    if (result instanceof Error) {
      throw result
    }

    expect(result.uci).toBe('e2e4')
  })

  it('retries until the global attempt limit and then returns the invalid move error', async () => {
    const actor = GoogleActor.create(config)

    if (!(actor instanceof GoogleActorRuntime)) {
      throw actor
    }

    const client = Reflect.get(actor, 'client') as GoogleGenAI
    const generateContentMock = vi.spyOn(client.models, 'generateContent')

    for (let attempt = 0; attempt < AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS; attempt += 1) {
      generateContentMock.mockResolvedValueOnce(
        createResponse('{"from":"e2","to":"e5","promotion":"null"}') as never,
      )
    }

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(generateContentMock).toHaveBeenCalledTimes(
      AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS,
    )
    expect(result).toBeInstanceOf(IllegalMoveError)
  })

  it('passes the accumulated error stack in repeated sdk requests', async () => {
    const actor = GoogleActor.create(config)

    if (!(actor instanceof GoogleActorRuntime)) {
      throw actor
    }

    const client = Reflect.get(actor, 'client') as GoogleGenAI
    const generateContentMock = vi
      .spyOn(client.models, 'generateContent')
      .mockResolvedValueOnce(
        createResponse('{"from":"e2","to":"e5","promotion":"null"}') as never,
      )
      .mockResolvedValueOnce(
        createResponse('{"from":"e2","to":"e5","promotion":"null"}') as never,
      )
      .mockResolvedValueOnce(
        createResponse('{"from":"e2","to":"e4","promotion":"null"}') as never,
      )

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(result).not.toBeInstanceOf(Error)
    expect(generateContentMock).toHaveBeenCalledTimes(3)

    const firstInput = JSON.parse(generateContentMock.mock.calls[0][0].contents as string) as {
      errorStack: Array<{ index: number; name: string; message: string }>
    }
    const secondInput = JSON.parse(generateContentMock.mock.calls[1][0].contents as string) as {
      errorStack: Array<{ index: number; name: string; message: string }>
    }
    const thirdInput = JSON.parse(generateContentMock.mock.calls[2][0].contents as string) as {
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
    const actor = GoogleActor.create(config)

    if (!(actor instanceof GoogleActorRuntime)) {
      throw actor
    }

    const client = Reflect.get(actor, 'client') as GoogleGenAI
    const generateContentMock = vi
      .spyOn(client.models, 'generateContent')
      .mockRejectedValue(
        new ApiError({
          message: 'Unauthorized',
          status: 401,
        }),
      )

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(generateContentMock).toHaveBeenCalledTimes(1)
    expect(result).toBeInstanceOf(GoogleGenAiHttpError)
  })

  it('passes the abort signal into the Gemini request config', async () => {
    const actor = GoogleActor.create(config)

    if (!(actor instanceof GoogleActorRuntime)) {
      throw actor
    }

    const controller = new AbortController()
    const client = Reflect.get(actor, 'client') as GoogleGenAI
    const generateContentMock = vi
      .spyOn(client.models, 'generateContent')
      .mockResolvedValue(
        createResponse('{"from":"e2","to":"e4","promotion":"null"}') as never,
      )

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: controller.signal,
    })

    expect(result).not.toBeInstanceOf(Error)
    expect(generateContentMock).toHaveBeenCalledTimes(1)
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: DEFAULT_GOOGLE_MODEL,
        config: expect.objectContaining({
          abortSignal: controller.signal,
        }),
      }),
    )
  })
})
