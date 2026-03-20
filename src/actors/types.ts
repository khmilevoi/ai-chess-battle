import type { ComponentType } from 'react'
import type { ZodType } from 'zod'
import type { ActorConfigError, ActorError } from '../shared/errors'
import type { ActorMove, GameActor, Side } from '../domain/chess/types'

export interface InteractiveActor extends GameActor {
  kind: 'interactive'
  submitMove(move: ActorMove): ActorError | null
}

export interface AutonomousActor extends GameActor {
  kind: 'autonomous'
}

export type AnyActorModel = InteractiveActor | AutonomousActor

export type ActorSettingsProps<Config> = {
  side: Side
  value: Config
  onChange: (next: Config) => void
  errors: Record<string, Array<string>>
}

export interface ActorDescriptor<
  Key extends string = string,
  Model extends AnyActorModel = AnyActorModel,
  Config = unknown,
  SettingsComponent extends ComponentType<ActorSettingsProps<Config>> = ComponentType<
    ActorSettingsProps<Config>
  >,
> {
  key: Key
  displayName: string
  summary: string
  configSchema: ZodType<Config>
  createDefaultConfig: () => Config
  create: (config: unknown) => Model | ActorConfigError
  SettingsComponent: SettingsComponent
}

export function defineActor<
  const Key extends string,
  Model extends AnyActorModel,
  Config,
  SettingsComponent extends ComponentType<ActorSettingsProps<Config>>,
>(descriptor: ActorDescriptor<Key, Model, Config, SettingsComponent>) {
  return descriptor
}

type ActorRegistryLike = Record<string, { key: string }>

type ActorDescriptorParts<Descriptor> =
  Descriptor extends ActorDescriptor<
    infer Key,
    infer Model,
    infer Config,
    infer SettingsComponent
  >
    ? {
        key: Key
        model: Model
        config: Config
        SettingsComponent: SettingsComponent
      }
    : never

type EnsureRegistryDescriptors<Registry extends ActorRegistryLike> = {
  [K in Extract<keyof Registry, string>]: [ActorDescriptorParts<Registry[K]>] extends [never]
    ? never
    : ActorKeyOf<Registry[K]> extends K
    ? Registry[K]
    : never
}

export function defineActorRegistry<
  const Registry extends ActorRegistryLike,
>(registry: Registry & EnsureRegistryDescriptors<Registry>) {
  return registry
}

export type ActorKeyOf<Descriptor> =
  ActorDescriptorParts<Descriptor> extends { key: infer Key } ? Key : never

export type ActorConfigOf<Descriptor> =
  ActorDescriptorParts<Descriptor> extends { config: infer Config }
    ? Config
    : never

export type ActorModelOf<Descriptor> =
  ActorDescriptorParts<Descriptor> extends { model: infer Model } ? Model : never

export type ActorUIOf<Descriptor> =
  ActorDescriptorParts<Descriptor> extends {
    SettingsComponent: infer SettingsComponent
  }
    ? SettingsComponent
    : never

export type ActorSettingsPropsOf<Descriptor> =
  ActorConfigOf<Descriptor> extends infer Config ? ActorSettingsProps<Config> : never

export type MatchSideConfigOf<Descriptor> =
  ActorDescriptorParts<Descriptor> extends {
    key: infer Key
    config: infer Config
  }
    ? {
        actorKey: Key
        actorConfig: Config
      }
    : never

export type ActorKeyFromRegistry<Registry extends ActorRegistryLike> = Extract<
  keyof Registry,
  string
>

export type ActorUnionFromRegistry<Registry extends ActorRegistryLike> =
  Registry[ActorKeyFromRegistry<Registry>]

export type ActorDescriptorByKey<
  Registry extends ActorRegistryLike,
  Key extends ActorKeyFromRegistry<Registry>,
> = Registry[Key]

export type ActorConfigMapFromRegistry<Registry extends ActorRegistryLike> = {
  [K in ActorKeyFromRegistry<Registry>]: ActorConfigOf<
    ActorDescriptorByKey<Registry, K>
  >
}

export type ActorModelMapFromRegistry<Registry extends ActorRegistryLike> = {
  [K in ActorKeyFromRegistry<Registry>]: ActorModelOf<
    ActorDescriptorByKey<Registry, K>
  >
}

export type ActorModelUnionFromRegistry<Registry extends ActorRegistryLike> =
  ActorModelOf<ActorUnionFromRegistry<Registry>>

export type MatchSideConfigFromRegistry<
  Registry extends ActorRegistryLike,
  Key extends ActorKeyFromRegistry<Registry> = ActorKeyFromRegistry<Registry>,
> = Key extends ActorKeyFromRegistry<Registry>
  ? MatchSideConfigOf<ActorDescriptorByKey<Registry, Key>>
  : never

export type MatchConfigFromRegistry<Registry extends ActorRegistryLike> = {
  white: MatchSideConfigFromRegistry<Registry>
  black: MatchSideConfigFromRegistry<Registry>
}

export type SideValidation<SideConfig> = {
  config: SideConfig | null
  error: ActorConfigError | null
  fieldErrors: Record<string, Array<string>>
}
