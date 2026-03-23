import { describe, expect, it } from 'vitest'
import type { ActorContext, ActorMove } from '../../domain/chess/types'
import {
  ActorError,
  IllegalMoveError,
  TurnCancelledError,
  type ActorRequestError,
} from '../../shared/errors'
import {
  AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS,
  AiActor,
  type AiActorRequestArgs,
} from './model'

const context: ActorContext = {
  side: 'white',
  snapshot: {
    fen: '8/8/8/8/8/8/8/8 w - - 0 1',
    turn: 'white',
    pieces: [],
    status: { kind: 'active', turn: 'white' },
    lastMove: null,
    history: [],
  },
  legalMovesBySquare: {
    e2: ['e4'],
  },
  moveCount: 0,
}

const legalMove: ActorMove = {
  from: 'e2',
  to: 'e4',
  uci: 'e2e4',
}

async function flushMicrotask() {
  await Promise.resolve()
}

class FakeAiActor extends AiActor {
  readonly attempts: Array<{ errorStack: Array<string> }> = []

  private readonly results: Array<ActorMove | Error>

  constructor(results: Array<ActorMove | Error>) {
    super({
      displayName: 'Fake AI actor',
      name: 'testAiActor',
    })
    this.results = [...results]
  }

  protected async requestModelMove({
    errorStack,
  }: AiActorRequestArgs): Promise<ActorMove | Error> {
    this.attempts.push({
      errorStack: errorStack.map((error) => error.message),
    })

    const result = this.results.shift()

    if (result === undefined) {
      return new ActorError({
        message: 'Missing fake move result.',
      })
    }

    return result
  }

  protected isRetryableError(error: ActorRequestError) {
    return error instanceof IllegalMoveError
  }
}

describe('AiActor', () => {
  it('blocks beforeRequestMove until confirmation is sent', async () => {
    const actor = new FakeAiActor([legalMove])

    actor.setWaitForConfirmation(true)

    let settled = false
    const pendingConfirmation = actor.beforeRequestMove({
      context,
      signal: new AbortController().signal,
    })
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

  it('releases pending confirmation when waiting is disabled', async () => {
    const actor = new FakeAiActor([legalMove])

    actor.setWaitForConfirmation(true)

    const pendingConfirmation = actor.beforeRequestMove({
      context,
      signal: new AbortController().signal,
    })

    await flushMicrotask()

    actor.setWaitForConfirmation(false)

    expect(await pendingConfirmation).toBeNull()
    expect(actor.waitForConfirmation()).toBe(false)
    expect(actor.confirmationPending()).toBeNull()
  })

  it('returns TurnCancelledError when confirmation wait is aborted', async () => {
    const actor = new FakeAiActor([legalMove])
    const controller = new AbortController()

    actor.setWaitForConfirmation(true)

    const pendingConfirmation = actor.beforeRequestMove({
      context,
      signal: controller.signal,
    })

    controller.abort(new TurnCancelledError({ side: 'white' }))

    const result = await pendingConfirmation

    expect(result).toBeInstanceOf(TurnCancelledError)
    expect(actor.confirmationPending()).toBeNull()
  })

  it('retries with the accumulated error stack for retryable errors', async () => {
    const actor = new FakeAiActor([
      new IllegalMoveError({
        uci: 'e2e5',
        cause: new Error('Illegal move in fake actor.'),
      }),
      legalMove,
    ])

    const result = await actor.requestMove({
      context,
      signal: new AbortController().signal,
    })

    expect(actor.attempts).toEqual([
      { errorStack: [] },
      { errorStack: ['Illegal move e2e5'] },
    ])
    expect(result).toEqual(legalMove)
  })

  it('does not retry non-retryable errors', async () => {
    const actorError = new ActorError({
      message: 'Non-retryable failure.',
    })
    const actor = new FakeAiActor([actorError, legalMove])

    const result = await actor.requestMove({
      context,
      signal: new AbortController().signal,
    })

    expect(actor.attempts).toEqual([{ errorStack: [] }])
    expect(result).toBe(actorError)
  })

  it('stops retrying after the global attempt limit', async () => {
    const repeatedFailures = Array.from(
      { length: AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS + 1 },
      (_, index) =>
        new IllegalMoveError({
          uci: `invalid-${index + 1}`,
          cause: new Error(`Illegal move #${index + 1}`),
        }),
    )
    const actor = new FakeAiActor(repeatedFailures)

    const result = await actor.requestMove({
      context,
      signal: new AbortController().signal,
    })

    expect(actor.attempts).toHaveLength(AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS)
    expect(actor.attempts[0]).toEqual({ errorStack: [] })
    expect(actor.attempts[1]).toEqual({
      errorStack: ['Illegal move invalid-1'],
    })
    expect(actor.attempts[2]).toEqual({
      errorStack: ['Illegal move invalid-1', 'Illegal move invalid-2'],
    })
    expect(result).toBe(repeatedFailures[AI_ACTOR_REQUEST_MOVE_MAX_ATTEMPTS - 1])
  })
})
