import type { ReactNode } from 'react'
import {
  type ActorKey,
  type MatchSideConfig,
  getRegisteredActor,
} from '../../actors/registry'
import type { Side } from '../../domain/chess/types'

export type ActorSettingsFieldsProps<K extends ActorKey = ActorKey> = {
  side: Side
  sideConfig: MatchSideConfig<K>
  onChange: (next: MatchSideConfig<K>) => void
  errors: Record<string, Array<string>>
}

function assertNever(value: never): ReactNode {
  throw new Error(`Unhandled actor settings variant: ${String(value)}`)
}

type BranchActorSettingsProps<K extends ActorKey> = {
  side: Side
  sideConfig: MatchSideConfig<K>
  onChange: (next: MatchSideConfig<K>) => void
  errors: Record<string, Array<string>>
}

function HumanActorSettingsFields({
  side,
  sideConfig,
  onChange,
  errors,
}: BranchActorSettingsProps<'human'>) {
  const descriptor = getRegisteredActor('human')
  const SettingsComponent = descriptor.SettingsComponent

  return (
    <SettingsComponent
      side={side}
      value={sideConfig.actorConfig}
      onChange={(actorConfig) =>
        onChange({
          actorKey: descriptor.key,
          actorConfig,
        })
      }
      errors={errors}
    />
  )
}

function OpenAiActorSettingsFields({
  side,
  sideConfig,
  onChange,
  errors,
}: BranchActorSettingsProps<'openai'>) {
  const descriptor = getRegisteredActor('openai')
  const SettingsComponent = descriptor.SettingsComponent

  return (
    <SettingsComponent
      side={side}
      value={sideConfig.actorConfig}
      onChange={(actorConfig) =>
        onChange({
          actorKey: descriptor.key,
          actorConfig,
        })
      }
      errors={errors}
    />
  )
}

export function ActorSettingsFields({
  side,
  sideConfig,
  onChange,
  errors,
}: ActorSettingsFieldsProps) {
  switch (sideConfig.actorKey) {
    case 'human':
      return (
        <HumanActorSettingsFields
          side={side}
          sideConfig={sideConfig}
          onChange={onChange}
          errors={errors}
        />
      )

    case 'openai':
      return (
        <OpenAiActorSettingsFields
          side={side}
          sideConfig={sideConfig}
          onChange={onChange}
          errors={errors}
        />
      )

    default:
      return assertNever(sideConfig)
  }
}
