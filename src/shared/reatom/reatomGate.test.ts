import { describe, expect, it } from 'vitest'
import { reatomGate } from './reatomGate'

let gateId = 0

function createTestGate() {
  return reatomGate<string | Error, string>({
    name: `testGate#${++gateId}`,
    mapAbort: ({ params, reason }) =>
      new Error(`aborted:${params}:${String(reason ?? 'unknown')}`),
    mapConcurrentSpawn: ({ params, pending }) =>
      new Error(`concurrent:${pending.params}->${params}`),
    mapMissingPendingSend: ({ value }) => new Error(`missing:${value}`),
  })
}

describe('reatomGate', () => {
  it('resolves spawned waiter and clears pending state after send', async () => {
    const gate = createTestGate()
    const pendingResult = gate.spawn({ params: 'white' })

    expect(gate.isPending()).toBe(true)
    expect(gate.pending()).toEqual({ params: 'white' })
    expect(gate.send('e2e4')).toBeNull()
    expect(await pendingResult).toBe('e2e4')
    expect(gate.isPending()).toBe(false)
    expect(gate.pending()).toBeNull()
  })

  it('maps abort results and clears pending state', async () => {
    const gate = createTestGate()
    const controller = new AbortController()
    const pendingResult = gate.spawn({
      params: 'black',
      signal: controller.signal,
    })

    controller.abort('cancelled')

    const result = await pendingResult
    expect(result).toBeInstanceOf(Error)

    if (result instanceof Error) {
      expect(result.message).toBe('aborted:black:cancelled')
    }

    expect(gate.isPending()).toBe(false)
    expect(gate.pending()).toBeNull()
  })

  it('rejects concurrent spawn without disturbing the original waiter', async () => {
    const gate = createTestGate()
    const firstWaiter = gate.spawn({ params: 'white' })
    const secondWaiter = await gate.spawn({ params: 'black' })

    expect(secondWaiter).toBeInstanceOf(Error)

    if (secondWaiter instanceof Error) {
      expect(secondWaiter.message).toBe('concurrent:white->black')
    }

    expect(gate.pending()).toEqual({ params: 'white' })
    expect(gate.send('e2e4')).toBeNull()
    expect(await firstWaiter).toBe('e2e4')
    expect(gate.pending()).toBeNull()
  })

  it('returns an error when send is called without a pending waiter', () => {
    const gate = createTestGate()
    const result = gate.send('e2e4')

    expect(result).toBeInstanceOf(Error)

    if (result instanceof Error) {
      expect(result.message).toBe('missing:e2e4')
    }
  })
})
