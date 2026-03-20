import { beforeEach, describe, expect, it, vi } from 'vitest'
import OpenAI from 'openai'
import type { Response as OpenAiResponse } from 'openai/resources/responses/responses'
import {
  IllegalMoveError,
  OpenAiHttpError,
  OpenAiTransportError,
} from '../../shared/errors'
import { createChessEngine } from '../chess/createChessEngine'
import type { ActorContext } from '../chess/types'
import { DEFAULT_OPENAI_MODEL, OpenAiActor } from '../../actors/openai'

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

describe('OpenAiActor', () => {
  const config = {
    apiKey: 'test-key',
    model: DEFAULT_OPENAI_MODEL,
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns transport errors as values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const actor = OpenAiActor.create(config)

    if (actor instanceof Error) {
      throw actor
    }

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(result).toBeInstanceOf(OpenAiTransportError)
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

    if (actor instanceof Error) {
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

  it('retries once and then returns an illegal move error when the move stays invalid', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createSuccessResponse('{"from":"e2","to":"e5","promotion":"null"}'),
      )
      .mockResolvedValueOnce(
        createSuccessResponse('{"from":"e2","to":"e5","promotion":"null"}'),
      )
    vi.stubGlobal('fetch', fetchMock)
    const actor = OpenAiActor.create(config)

    if (actor instanceof Error) {
      throw actor
    }

    const result = await actor.requestMove({
      context: createActorContext(),
      signal: new AbortController().signal,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result).toBeInstanceOf(IllegalMoveError)
  })

  it('returns http errors without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('nope', {
        status: 401,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const actor = OpenAiActor.create(config)

    if (actor instanceof Error) {
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

    if (actor instanceof Error) {
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
    expect(createMock).toHaveBeenCalledWith(expect.any(Object), {
      signal: controller.signal,
    })
  })
})
