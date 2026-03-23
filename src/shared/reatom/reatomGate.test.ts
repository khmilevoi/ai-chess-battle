import { describe, expect, it } from 'vitest'
import { named } from '@reatom/core'
import {
  ReatomGateAbortError,
  ReatomGateConcurrentSpawnError,
  ReatomGateMissingPendingSendError,
  reatomGate,
} from './reatomGate'

function createTestGate() {
  const name = named('testGate')
  return {
    name,
    gate: reatomGate<string, string>({ name }),
  }
}

describe('reatomGate', () => {
  it('resolves spawned waiter and clears pending state after send', async () => {
    const { gate } = createTestGate()
    const pendingResult = gate.spawn({ params: 'white' })

    expect(gate.isPending()).toBe(true)
    expect(gate.pending()).toEqual({ params: 'white' })
    expect(gate.send('e2e4')).toBeNull()
    expect(await pendingResult).toBe('e2e4')
    expect(gate.isPending()).toBe(false)
    expect(gate.pending()).toBeNull()
  })

  it('maps abort results and clears pending state', async () => {
    const { gate, name } = createTestGate()
    const controller = new AbortController()
    const pendingResult = gate.spawn({
      params: 'black',
      signal: controller.signal,
    })

    controller.abort('cancelled')

    const result = await pendingResult
    expect(result).toBeInstanceOf(ReatomGateAbortError)

    if (result instanceof ReatomGateAbortError) {
      expect(result.gateName).toBe(name)
      expect(result.params).toBe('black')
      expect(result.cause).toBe('cancelled')
    }

    expect(gate.isPending()).toBe(false)
    expect(gate.pending()).toBeNull()
  })

  it('rejects concurrent spawn without disturbing the original waiter', async () => {
    const { gate, name } = createTestGate()
    const firstWaiter = gate.spawn({ params: 'white' })
    const secondWaiter = await gate.spawn({ params: 'black' })

    expect(secondWaiter).toBeInstanceOf(ReatomGateConcurrentSpawnError)

    if (secondWaiter instanceof ReatomGateConcurrentSpawnError) {
      expect(secondWaiter.gateName).toBe(name)
      expect(secondWaiter.params).toBe('black')
      expect(secondWaiter.pendingParams).toBe('white')
    }

    expect(gate.pending()).toEqual({ params: 'white' })
    expect(gate.send('e2e4')).toBeNull()
    expect(await firstWaiter).toBe('e2e4')
    expect(gate.pending()).toBeNull()
  })

  it('returns an error when send is called without a pending waiter', () => {
    const { gate, name } = createTestGate()
    const result = gate.send('e2e4')

    expect(result).toBeInstanceOf(ReatomGateMissingPendingSendError)

    if (result instanceof ReatomGateMissingPendingSendError) {
      expect(result.gateName).toBe(name)
    }
  })
})
