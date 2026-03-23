import * as errore from 'errore'
import { action, atom, computed } from '@reatom/core'

type ReatomGateSpawnArgs<TParams> = [TParams] extends [void]
  ? {
      params?: TParams
      signal?: AbortSignal
    }
  : {
      params: TParams
      signal?: AbortSignal
    }

type PendingWaiter<TResult, TParams> = {
  params: TParams
  resolve: (result: TResult) => void
  cleanup: () => void
}

export class ReatomGateBaseError extends Error {
  readonly gateName: string

  constructor(message: string, { gateName, cause }: { gateName: string; cause?: unknown }) {
    super(message, { cause })
    this.name = new.target.name
    this.gateName = gateName
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class ReatomGateError extends ReatomGateBaseError {}

export class ReatomGateAbortError<TParams = unknown> extends errore.AbortError {
  readonly gateName: string
  readonly params: TParams

  constructor({
    gateName,
    params,
    cause,
  }: {
    gateName: string
    params: TParams
    cause?: unknown
  }) {
    super(`Reatom gate "${gateName}" was aborted`, { cause })
    this.name = new.target.name
    this.gateName = gateName
    this.params = params
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class ReatomGateConcurrentSpawnError<TParams = unknown> extends ReatomGateError {
  readonly params: TParams
  readonly pendingParams: TParams

  constructor({
    gateName,
    params,
    pendingParams,
  }: {
    gateName: string
    params: TParams
    pendingParams: TParams
  }) {
    super(`Reatom gate "${gateName}" already has a pending waiter`, {
      gateName,
    })
    this.params = params
    this.pendingParams = pendingParams
  }
}

export class ReatomGateMissingPendingSendError extends ReatomGateError {
  constructor({ gateName }: { gateName: string }) {
    super(`Reatom gate "${gateName}" has no pending waiter`, { gateName })
  }
}

export type ReatomGateSpawnResult<TResult, TParams = unknown> =
  | TResult
  | ReatomGateAbortError<TParams>
  | ReatomGateConcurrentSpawnError<TParams>

export function reatomGate<TResult, TParams = void>({ name }: { name: string }) {
  const waiter = atom<PendingWaiter<TResult, TParams> | null>(
    null,
    `${name}.waiter`,
  )
  const pending = computed(() => {
    const current = waiter()
    return current === null ? null : { params: current.params }
  }, `${name}.pending`)
  const isPending = computed(() => pending() !== null, `${name}.isPending`)

  const spawn = action(async (args: ReatomGateSpawnArgs<TParams>) => {
    const params = (args?.params ?? undefined) as TParams
    const signal = args?.signal
    const current = waiter()

    if (current !== null) {
      return new ReatomGateConcurrentSpawnError({
        gateName: name,
        params,
        pendingParams: current.params,
      })
    }

    if (signal?.aborted) {
      return new ReatomGateAbortError({
        gateName: name,
        params,
        cause: signal.reason,
      })
    }

    return await new Promise<ReatomGateSpawnResult<TResult>>((resolve) => {
      let onAbort: EventListener | null = null
      const cleanup = () => {
        if (signal && onAbort) {
          signal.removeEventListener('abort', onAbort)
        }
        waiter.set(null)
      }

      onAbort = signal
        ? () => {
            cleanup()
            resolve(
              new ReatomGateAbortError({
                gateName: name,
                params,
                cause: signal.reason,
              }),
            )
          }
        : null

      waiter.set({
        params,
        resolve,
        cleanup,
      })

      if (signal && onAbort) {
        signal.addEventListener('abort', onAbort, { once: true })

        if (signal.aborted) {
          onAbort(new Event('abort'))
        }
      }
    })
  }, `${name}.spawn`)

  const send = action((value: TResult) => {
    const current = waiter()

    if (current === null) {
      return new ReatomGateMissingPendingSendError({
        gateName: name,
      })
    }

    current.cleanup()
    current.resolve(value)
    return null
  }, `${name}.send`)

  return {
    spawn,
    send,
    pending,
    isPending,
  }
}
