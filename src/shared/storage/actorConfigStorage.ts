import { atom, computed, peek, withLocalStorage } from '@reatom/core'
import {
  getRegisteredActor,
  type ActorConfigMap,
  type ActorKey,
} from '@/actors/registry'
import { vaultSecretsAtom } from './credentialVault'
import {
  normalizeStoredActorConfigMapValue,
  redactSecrets,
  resolveStoredActorConfigMap,
  type StoredActorConfigMap,
} from './helpers'

const STORAGE_KEY = 'ai-chess-battle.actor-configs'
const STORAGE_VERSION = 'actor-configs@2'

function getPersistSnapshotValue(persist: unknown): unknown {
  if (typeof persist === 'object' && persist !== null && 'data' in persist) {
    return (persist as { data: unknown }).data
  }

  return persist
}

function readSnapshotFromStorage(): StoredActorConfigMap {
  const rawSnapshot = window.localStorage.getItem(STORAGE_KEY)

  if (rawSnapshot === null) {
    return {}
  }

  try {
    const parsed = JSON.parse(rawSnapshot) as unknown

    return normalizeStoredActorConfigMapValue(getPersistSnapshotValue(parsed)) ?? {}
  } catch {
    return {}
  }
}

const storedActorConfigSnapshotAtom = atom<StoredActorConfigMap>(
  {},
  'storage.actorConfigMap.snapshot',
).extend(
  withLocalStorage({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    migration: (persist) =>
      normalizeStoredActorConfigMapValue(getPersistSnapshotValue(persist)) ?? {},
    fromSnapshot: (snapshot, state) => {
      const normalized = normalizeStoredActorConfigMapValue(
        getPersistSnapshotValue(snapshot),
      )
      return normalized ?? state ?? {}
    },
  }),
)

const storedActorConfigMap = computed(
  () => resolveStoredActorConfigMap(storedActorConfigSnapshotAtom(), vaultSecretsAtom()),
  'storage.actorConfigMap',
)

function readResolvedActorConfigMap() {
  const secretsByActorKey = peek(vaultSecretsAtom)
  const resolvedFromAtom = resolveStoredActorConfigMap(
    storedActorConfigSnapshotAtom(),
    secretsByActorKey,
  )

  if (
    Object.keys(resolvedFromAtom).length > 0 ||
    window.localStorage.getItem(STORAGE_KEY) === null
  ) {
    return resolvedFromAtom
  }

  return resolveStoredActorConfigMap(readSnapshotFromStorage(), secretsByActorKey)
}

export function loadStoredActorConfig<K extends ActorKey>(
  actorKey: K,
): ActorConfigMap[K] | null {
  return (readResolvedActorConfigMap()[actorKey] as ActorConfigMap[K] | undefined) ?? null
}

export function readStoredActorConfig<K extends ActorKey>(
  actorKey: K,
): ActorConfigMap[K] | null {
  const resolvedFromAtom = peek(storedActorConfigMap)
  const resolvedConfig =
    (resolvedFromAtom[actorKey] as ActorConfigMap[K] | undefined) ??
    (resolveStoredActorConfigMap(readSnapshotFromStorage(), peek(vaultSecretsAtom))[actorKey] as
      | ActorConfigMap[K]
      | undefined)

  return resolvedConfig ?? null
}

export function saveStoredActorConfig<K extends ActorKey>(
  actorKey: K,
  config: ActorConfigMap[K],
): void {
  const validation = getRegisteredActor(actorKey).configSchema.safeParse(config)

  if (!validation.success) {
    console.warn(`Ignored invalid actor config for ${actorKey}.`)
    return
  }

  storedActorConfigSnapshotAtom.set({
    ...storedActorConfigSnapshotAtom(),
    [actorKey]: redactSecrets(actorKey, validation.data as ActorConfigMap[K]),
  } as StoredActorConfigMap)
}

export function clearStoredActorConfigMap(): void {
  storedActorConfigSnapshotAtom.set({})
}
