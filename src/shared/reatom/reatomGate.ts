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

export function reatomGate<
  TResult,
  TParams = void,
  TSendError extends Error = Error,
>({
  name,
  mapAbort,
  mapConcurrentSpawn,
  mapMissingPendingSend,
}: {
  name: string
  mapAbort: (args: { params: TParams; reason: unknown }) => TResult
  mapConcurrentSpawn: (args: {
    params: TParams
    pending: { params: TParams }
  }) => TResult
  mapMissingPendingSend: (args: { value: TResult }) => TSendError
}) {
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
      return mapConcurrentSpawn({
        params,
        pending: { params: current.params },
      })
    }

    if (signal?.aborted) {
      return mapAbort({ params, reason: signal.reason })
    }

    return await new Promise<TResult>((resolve) => {
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
            resolve(mapAbort({ params, reason: signal.reason }))
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
      return mapMissingPendingSend({ value })
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
