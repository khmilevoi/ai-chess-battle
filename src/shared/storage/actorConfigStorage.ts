import { atom, peek, withLocalStorage } from '@reatom/core'
import {
  getRegisteredActor,
  isActorKey,
  type ActorConfigMap,
  type ActorKey,
} from '../../actors/registry'

const STORAGE_KEY = 'ai-chess-battle.actor-configs'
const STORAGE_VERSION = 'actor-configs@1'
export type StoredActorConfigMap = Partial<Record<ActorKey, unknown>>

const storedActorConfigMap = atom<StoredActorConfigMap>(
  {},
  'storage.actorConfigMap',
).extend(
  withLocalStorage({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    fromSnapshot: (snapshot, state) => {
      const normalized = normalizeStoredActorConfigMap(snapshot)
      return normalized ?? state ?? {}
    },
  }),
)

function normalizeStoredActorConfigMap(
  value: unknown,
): StoredActorConfigMap | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  const result: StoredActorConfigMap = {}

  for (const [key, config] of Object.entries(value as Record<string, unknown>)) {
    if (!isActorKey(key)) {
      return null
    }

    const actorKey = key as ActorKey
    const validation = getRegisteredActor(actorKey).configSchema.safeParse(config)

    if (!validation.success) {
      return null
    }

    result[actorKey] = validation.data
  }

  return result
}

export function loadStoredActorConfig<K extends ActorKey>(
  actorKey: K,
): ActorConfigMap[K] | null {
  return (storedActorConfigMap()[actorKey] as ActorConfigMap[K] | undefined) ?? null
}

export function readStoredActorConfig<K extends ActorKey>(
  actorKey: K,
): ActorConfigMap[K] | null {
  return (peek(storedActorConfigMap)[actorKey] as ActorConfigMap[K] | undefined) ?? null
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

  storedActorConfigMap.set({
    ...storedActorConfigMap(),
    [actorKey]: validation.data,
  } as StoredActorConfigMap)
}

export function clearStoredActorConfigMap(): void {
  storedActorConfigMap.set({})
}
