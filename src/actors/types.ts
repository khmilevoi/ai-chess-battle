import type { ComponentType } from 'react'
import type { ZodType } from 'zod'
import type { ActorConfigError, ActorError } from '@/shared/errors'
import type { ActorMove, GameActor, Side } from '@/domain/chess/types'

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

export type ActorMatchInfoProps<Config> = {
  side: Side
  value: Config
}

export type ActorControlsProps<Model extends AnyActorModel = AnyActorModel> = {
  side: Side
  sides: Array<Side>
  activeSide: Side | null
  actor: Model
}

export type ActorCreateOptions<RuntimeControls = unknown> = {
  runtimeControls?: RuntimeControls
}

export type ActorControlsContract<
  Config = unknown,
  StoredState = unknown,
  RuntimeControls = unknown,
> = {
  storageSchema: ZodType<StoredState>
  createDefaultStoredState: () => StoredState
  getControlGroupKey: (config: Config) => string
  createRuntimeControls: (args: {
    name: string
    initialState: StoredState
    persist: (nextState: StoredState) => void
  }) => RuntimeControls
}

export interface ActorDescriptor<
  Key extends string = string,
  Model extends AnyActorModel = AnyActorModel,
  Config = unknown,
  SettingsComponent extends ComponentType<ActorSettingsProps<Config>> = ComponentType<
    ActorSettingsProps<Config>
  >,
  MatchInfoComponent extends ComponentType<ActorMatchInfoProps<Config>> = ComponentType<
    ActorMatchInfoProps<Config>
  >,
> {
  key: Key
  displayName: string
  summary: string
  configSchema: ZodType<Config>
  secretField?: Extract<keyof Config, string>
  createDefaultConfig: () => Config
  create: (
    config: unknown,
    options?: ActorCreateOptions,
  ) => Model | ActorConfigError
  SettingsComponent: SettingsComponent
  MatchInfoComponent: MatchInfoComponent
  ControlsComponent?: ComponentType<ActorControlsProps<Model>>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controlsContract?: ActorControlsContract<Config, any, any>
}

export function defineActor<
  const Key extends string,
  Model extends AnyActorModel,
  Config,
  SettingsComponent extends ComponentType<ActorSettingsProps<Config>>,
  MatchInfoComponent extends ComponentType<ActorMatchInfoProps<Config>>,
>(descriptor: ActorDescriptor<Key, Model, Config, SettingsComponent, MatchInfoComponent>) {
  return descriptor
}

type ActorRegistryLike = Record<string, { key: string }>

type ActorDescriptorParts<Descriptor> =
  Descriptor extends ActorDescriptor<
    infer Key,
    infer Model,
    infer Config,
    infer SettingsComponent,
    infer MatchInfoComponent
  >
    ? {
        key: Key
        model: Model
        config: Config
        SettingsComponent: SettingsComponent
        MatchInfoComponent: MatchInfoComponent
        ControlsComponent: ActorDescriptor<
          Key,
          Model & AnyActorModel,
          Config,
          SettingsComponent & ComponentType<ActorSettingsProps<Config>>,
          MatchInfoComponent & ComponentType<ActorMatchInfoProps<Config>>
        >['ControlsComponent']
        controlsContract: ActorDescriptor<
          Key,
          Model & AnyActorModel,
          Config,
          SettingsComponent & ComponentType<ActorSettingsProps<Config>>,
          MatchInfoComponent & ComponentType<ActorMatchInfoProps<Config>>
        >['controlsContract']
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

export type ActorMatchInfoUIOf<Descriptor> =
  ActorDescriptorParts<Descriptor> extends {
    MatchInfoComponent: infer MatchInfoComponent
  }
    ? MatchInfoComponent
    : never

export type ActorMatchInfoPropsOf<Descriptor> =
  ActorConfigOf<Descriptor> extends infer Config ? ActorMatchInfoProps<Config> : never

export type ActorControlsUIOf<Descriptor> =
  ActorDescriptorParts<Descriptor> extends {
    ControlsComponent: infer ControlsComponent
  }
    ? ControlsComponent
    : never

export type ActorControlsPropsOf<Descriptor> =
  ActorModelOf<Descriptor> extends infer Model
    ? ActorControlsProps<Model & AnyActorModel>
    : never

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
