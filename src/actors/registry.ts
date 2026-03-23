import { z } from 'zod'
import { ActorConfigError } from '../shared/errors'
import type { Side } from '../domain/chess/types'
import { OpenAiActor } from './ai-actor/open-ai'
import { HumanActor } from './human'
import {
  defineActorRegistry,
  type ActorConfigMapFromRegistry,
  type ActorDescriptorByKey,
  type ActorKeyFromRegistry,
  type ActorModelMapFromRegistry,
  type ActorModelUnionFromRegistry,
  type ActorUnionFromRegistry,
  type MatchConfigFromRegistry,
  type MatchSideConfigFromRegistry,
  type SideValidation,
} from './types'

export const actorRegistry = defineActorRegistry({
  human: HumanActor,
  openai: OpenAiActor,
})

export type ActorRegistry = typeof actorRegistry
export type ActorKey = ActorKeyFromRegistry<ActorRegistry>
export type ActorUnion = ActorUnionFromRegistry<ActorRegistry>
export type RegisteredActor<K extends ActorKey = ActorKey> = ActorDescriptorByKey<
  ActorRegistry,
  K
>
export type ActorConfigMap = ActorConfigMapFromRegistry<ActorRegistry>
export type ActorModelMap = ActorModelMapFromRegistry<ActorRegistry>
export type ActorModel = ActorModelUnionFromRegistry<ActorRegistry>
export type MatchSideConfig<K extends ActorKey = ActorKey> =
  MatchSideConfigFromRegistry<ActorRegistry, K>
export type MatchConfig = MatchConfigFromRegistry<ActorRegistry>
export type SideValidationResult<K extends ActorKey = ActorKey> =
  SideValidation<MatchSideConfig<K>>

export const actorKeys = Object.keys(actorRegistry) as [ActorKey, ...ActorKey[]]

function normalizeFieldErrors(
  fieldErrors: Record<string, Array<string> | undefined>,
): Record<string, Array<string>> {
  return Object.fromEntries(
    Object.entries(fieldErrors).map(([key, value]) => [key, value ?? []]),
  )
}

export function isActorKey(value: string): value is ActorKey {
  return value in actorRegistry
}

export function getRegisteredActor<K extends ActorKey>(
  actorKey: K,
): RegisteredActor<K> {
  return actorRegistry[actorKey]
}

export function listRegisteredActors(): Array<ActorUnion> {
  return actorKeys.map((key) => actorRegistry[key])
}

export function createDefaultSideConfig(): MatchSideConfig<'human'>
export function createDefaultSideConfig<K extends ActorKey>(
  actorKey: K,
): MatchSideConfig<K>
export function createDefaultSideConfig(actorKey: ActorKey = 'human') {
  const actor = getRegisteredActor(actorKey)

  return {
    actorKey: actor.key,
    actorConfig: actor.createDefaultConfig(),
  }
}

export function createDefaultMatchConfig(): MatchConfig {
  return {
    white: createDefaultSideConfig('human'),
    black: createDefaultSideConfig('human'),
  }
}

type MatchSideDraft<K extends ActorKey = ActorKey> = {
  actorKey: K
  actorConfig: unknown
}

export function validateSideConfig<K extends ActorKey>(
  side: Side,
  config: MatchSideConfig<K> | MatchSideDraft<K>,
): SideValidationResult<K> {
  const actor = getRegisteredActor(config.actorKey)
  const validation = actor.configSchema.safeParse(config.actorConfig)

  if (!validation.success) {
    return {
      config: null,
      error: new ActorConfigError({
        side,
        actorKey: config.actorKey,
        cause: validation.error,
      }),
      fieldErrors: normalizeFieldErrors(validation.error.flatten().fieldErrors),
    }
  }

  return {
    config: {
      actorKey: actor.key,
      actorConfig: validation.data,
    } as MatchSideConfig<K>,
    error: null,
    fieldErrors: {},
  }
}

export const matchSideDraftSchema = z.object({
  actorKey: z.enum(actorKeys),
  actorConfig: z.unknown(),
})
