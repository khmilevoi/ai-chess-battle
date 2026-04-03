import {
  getRegisteredActor,
  isActorKey,
  type ActorConfigMap,
  type ActorKey,
  type MatchConfig,
  type MatchSideConfig,
  type RegisteredActor,
} from '@/actors/registry'
import { getSecret } from './credentialVault'

type StoredActorConfigFor<Key extends ActorKey> = [RegisteredActor<Key>['secretField']] extends [
  keyof ActorConfigMap[Key],
]
  ? Omit<
      ActorConfigMap[Key],
      Extract<RegisteredActor<Key>['secretField'], keyof ActorConfigMap[Key]>
    >
  : ActorConfigMap[Key]

export type StoredSideConfig<Key extends ActorKey = ActorKey> = {
  actorKey: Key
  actorConfig: StoredActorConfigFor<Key>
}

export type StoredMatchConfig = {
  white: StoredSideConfig
  black: StoredSideConfig
}

export type StoredActorConfigMap = Partial<{
  [Key in ActorKey]: StoredActorConfigFor<Key>
}>

const SECRET_PLACEHOLDER = '__credential-vault__'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function redactResolvedActorConfig<Key extends ActorKey>(
  actorKey: Key,
  config: ActorConfigMap[Key],
): StoredActorConfigFor<Key> {
  const descriptor = getRegisteredActor(actorKey)

  if (!descriptor.secretField) {
    return config as StoredActorConfigFor<Key>
  }

  const redactedConfig = { ...(config as Record<string, unknown>) }

  delete redactedConfig[descriptor.secretField]

  return redactedConfig as StoredActorConfigFor<Key>
}

export function redactSecrets<Key extends ActorKey>(
  actorKey: Key,
  config: ActorConfigMap[Key],
): StoredActorConfigFor<Key> {
  return redactResolvedActorConfig(actorKey, config)
}

export function resolveRuntimeConfig<Key extends ActorKey>(
  actorKey: Key,
  config: StoredActorConfigFor<Key>,
): ActorConfigMap[Key] {
  const descriptor = getRegisteredActor(actorKey)

  if (!descriptor.secretField) {
    return config as ActorConfigMap[Key]
  }

  return {
    ...(config as Record<string, unknown>),
    [descriptor.secretField]: getSecret(actorKey) ?? '',
  } as ActorConfigMap[Key]
}

export function redactMatchConfig(config: MatchConfig): StoredMatchConfig {
  return {
    white: {
      actorKey: config.white.actorKey,
      actorConfig: redactSecrets(config.white.actorKey, config.white.actorConfig as never),
    },
    black: {
      actorKey: config.black.actorKey,
      actorConfig: redactSecrets(config.black.actorKey, config.black.actorConfig as never),
    },
  }
}

export function resolveStoredMatchConfig(config: StoredMatchConfig): MatchConfig {
  return {
    white: {
      actorKey: config.white.actorKey,
      actorConfig: resolveRuntimeConfig(
        config.white.actorKey,
        config.white.actorConfig as never,
      ),
    } as MatchSideConfig,
    black: {
      actorKey: config.black.actorKey,
      actorConfig: resolveRuntimeConfig(
        config.black.actorKey,
        config.black.actorConfig as never,
      ),
    } as MatchSideConfig,
  } as MatchConfig
}

function normalizeStoredActorConfigValue<Key extends ActorKey>(
  actorKey: Key,
  value: unknown,
): StoredActorConfigFor<Key> | null {
  if (!isRecord(value)) {
    return null
  }

  const descriptor = getRegisteredActor(actorKey)
  const normalizedCandidate = descriptor.secretField
    ? {
        ...value,
        [descriptor.secretField]: SECRET_PLACEHOLDER,
      }
    : value
  const validation = descriptor.configSchema.safeParse(normalizedCandidate)

  if (!validation.success) {
    return null
  }

  return redactResolvedActorConfig(actorKey, validation.data as ActorConfigMap[Key])
}

export function normalizeStoredActorConfigMapValue(
  value: unknown,
): StoredActorConfigMap | null {
  if (!isRecord(value)) {
    return null
  }

  const normalizedEntries: Array<[ActorKey, StoredActorConfigFor<ActorKey>]> = []

  for (const [key, config] of Object.entries(value)) {
    if (!isActorKey(key)) {
      return null
    }

    const normalizedConfig = normalizeStoredActorConfigValue(key, config)

    if (normalizedConfig === null) {
      return null
    }

    normalizedEntries.push([key, normalizedConfig as StoredActorConfigFor<ActorKey>])
  }

  return Object.fromEntries(normalizedEntries) as StoredActorConfigMap
}

export function resolveStoredActorConfigMap(configMap: StoredActorConfigMap) {
  return Object.fromEntries(
    Object.entries(configMap).flatMap(([key, config]) => {
      if (!isActorKey(key) || config === undefined) {
        return []
      }

      return [[key, resolveRuntimeConfig(key, config as never)]]
    }),
  ) as Partial<ActorConfigMap>
}

function normalizeStoredSide(
  value: unknown,
): StoredSideConfig | null {
  if (!isRecord(value) || typeof value.actorKey !== 'string') {
    return null
  }

  if (!isActorKey(value.actorKey)) {
    return null
  }

  const normalizedConfig = normalizeStoredActorConfigValue(
    value.actorKey,
    value.actorConfig,
  )

  if (normalizedConfig === null) {
    return null
  }

  return {
    actorKey: value.actorKey,
    actorConfig: normalizedConfig,
  } as StoredSideConfig
}

export function normalizeStoredMatchConfigSnapshotValue(
  value: unknown,
): StoredMatchConfig | null {
  if (!isRecord(value)) {
    return null
  }

  const white = normalizeStoredSide(value.white)

  if (white === null) {
    return null
  }

  const black = normalizeStoredSide(value.black)

  if (black === null) {
    return null
  }

  return {
    white,
    black,
  }
}

export function normalizeStoredMatchConfigValue(value: unknown): MatchConfig | null {
  const normalized = normalizeStoredMatchConfigSnapshotValue(value)

  if (normalized === null) {
    return null
  }

  return resolveStoredMatchConfig(normalized)
}

export function redactSideConfig<Key extends ActorKey>(
  sideConfig: MatchSideConfig<Key>,
): StoredSideConfig<Key> {
  return {
    actorKey: sideConfig.actorKey as Key,
    actorConfig: redactSecrets(sideConfig.actorKey, sideConfig.actorConfig),
  } as StoredSideConfig<Key>
}

export function resolveStoredSideConfig<Key extends ActorKey>(
  sideConfig: StoredSideConfig<Key>,
): MatchSideConfig<Key> {
  return {
    actorKey: sideConfig.actorKey as Key,
    actorConfig: resolveRuntimeConfig(sideConfig.actorKey, sideConfig.actorConfig),
  } as MatchSideConfig<Key>
}
