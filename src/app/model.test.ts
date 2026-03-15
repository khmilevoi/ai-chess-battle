import { beforeEach, describe, expect, it } from 'vitest'
import { ActorError } from '../shared/errors'
import { createAppModel } from './model'

function flush() {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}

describe('appModel', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('runs one human-human turn loop and applies the selected move', async () => {
    const model = createAppModel(`test-model-${crypto.randomUUID()}`)
    const startResult = await model.startMatch()

    expect(startResult).toBeNull()
    expect(model.snapshot()).not.toBeNull()

    model.clickSquare('e2')
    model.clickSquare('e4')
    await flush()

    const snapshot = model.snapshot()
    expect(snapshot?.history).toEqual(['e2e4'])
    expect(snapshot?.turn).toBe('black')
    expect(model.phase()).toBe('playing')
  })

  it('aborts the pending turn on reset and does not apply stale moves', async () => {
    const model = createAppModel(`test-model-${crypto.randomUUID()}`)
    const startResult = await model.startMatch()

    expect(startResult).toBeNull()

    const pendingActor = model.activeHumanActor()
    expect(pendingActor).not.toBeNull()

    model.resetMatch()
    const lateMoveResult = pendingActor?.submitMove({
      from: 'e2',
      to: 'e4',
      uci: 'e2e4',
    })
    await flush()

    expect(lateMoveResult).toBeInstanceOf(ActorError)
    expect(model.snapshot()).toBeNull()
    expect(model.phase()).toBe('setup')
  })
})
