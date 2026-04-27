import { atom, peek, withLocalStorage } from '@reatom/core'
import {
  getRegisteredArbiter,
  isArbiterKey,
  normalizeStoredArbiterConfigValue,
  type ArbiterProviderKey,
} from '@/arbiter/registry'
import type { ArbiterSideConfig } from '@/arbiter/types'

const STORAGE_KEY = 'ai-chess-battle.arbiter-configs'
const STORAGE_VERSION = 'arbiter-configs@2'

type StoredArbiterConfigMap = Partial<{
  [Key in ArbiterProviderKey]: Extract<ArbiterSideConfig, { arbiterKey: Key }>['arbiterConfig']
}>

function getPersistSnapshotValue(persist: unknown): unknown {
  if (typeof persist === 'object' && persist !== null && 'data' in persist) {
    return (persist as { data: unknown }).data
  }

  return persist
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeStoredArbiterConfigMapValue(
  value: unknown,
): StoredArbiterConfigMap {
  if (!isRecord(value)) {
    return {}
  }

  const normalizedEntries: Array<
    [ArbiterProviderKey, StoredArbiterConfigMap[ArbiterProviderKey]]
  > = []

  for (const [key, config] of Object.entries(value)) {
    if (!isArbiterKey(key)) {
      continue
    }

    const normalizedConfig = normalizeStoredArbiterConfigValue(key, config)

    if (normalizedConfig === null) {
      continue
    }

    normalizedEntries.push([key, normalizedConfig])
  }

  return Object.fromEntries(normalizedEntries) as StoredArbiterConfigMap
}

function readSnapshotFromStorage(): StoredArbiterConfigMap {
  const rawSnapshot = window.localStorage.getItem(STORAGE_KEY)

  if (rawSnapshot === null) {
    return {}
  }

  try {
    const parsed = JSON.parse(rawSnapshot) as unknown

    return normalizeStoredArbiterConfigMapValue(getPersistSnapshotValue(parsed))
  } catch {
    return {}
  }
}

const storedArbiterConfigMapAtom = atom<StoredArbiterConfigMap>(
  {},
  'storage.arbiterConfigMap',
).extend(
  withLocalStorage({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    migration: (persist) =>
      normalizeStoredArbiterConfigMapValue(getPersistSnapshotValue(persist)),
    fromSnapshot: (snapshot, state) => {
      const normalized = normalizeStoredArbiterConfigMapValue(
        getPersistSnapshotValue(snapshot),
      )
      return normalized ?? state ?? {}
    },
  }),
)

export function loadStoredArbiterConfig<Key extends ArbiterProviderKey>(
  arbiterKey: Key,
): Extract<ArbiterSideConfig, { arbiterKey: Key }>['arbiterConfig'] | null {
  const configMap = storedArbiterConfigMapAtom()
  const resolvedConfig =
    (configMap[arbiterKey] as
      | Extract<ArbiterSideConfig, { arbiterKey: Key }>['arbiterConfig']
      | undefined) ??
    (Object.keys(configMap).length > 0 || window.localStorage.getItem(STORAGE_KEY) === null
      ? undefined
      : (readSnapshotFromStorage()[arbiterKey] as
          | Extract<ArbiterSideConfig, { arbiterKey: Key }>['arbiterConfig']
          | undefined))

  return resolvedConfig ?? null
}

export function readStoredArbiterConfig<Key extends ArbiterProviderKey>(
  arbiterKey: Key,
): Extract<ArbiterSideConfig, { arbiterKey: Key }>['arbiterConfig'] | null {
  const configMap = peek(storedArbiterConfigMapAtom)
  const resolvedConfig =
    (configMap[arbiterKey] as
      | Extract<ArbiterSideConfig, { arbiterKey: Key }>['arbiterConfig']
      | undefined) ??
    (readSnapshotFromStorage()[arbiterKey] as
      | Extract<ArbiterSideConfig, { arbiterKey: Key }>['arbiterConfig']
      | undefined)

  return resolvedConfig ?? null
}

export function saveStoredArbiterConfig<Key extends ArbiterProviderKey>(
  arbiterKey: Key,
  config: Extract<ArbiterSideConfig, { arbiterKey: Key }>['arbiterConfig'],
): void {
  const validation = getRegisteredArbiter(arbiterKey).configSchema.safeParse(config)

  if (!validation.success) {
    console.warn(`Ignored invalid arbiter config for ${arbiterKey}.`)
    return
  }

  storedArbiterConfigMapAtom.set({
    ...storedArbiterConfigMapAtom(),
    [arbiterKey]: validation.data,
  } as StoredArbiterConfigMap)
}

export function clearStoredArbiterConfigMap(): void {
  storedArbiterConfigMapAtom.set({})
}
