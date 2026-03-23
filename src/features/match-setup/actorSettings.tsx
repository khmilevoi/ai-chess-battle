import type { ComponentType } from 'react'
import {
  type MatchSideConfig,
  getRegisteredActor,
} from '../../actors/registry'
import type { ActorSettingsProps } from '../../actors/types'
import type { Side } from '../../domain/chess/types'
import { reatomMemo } from '../../shared/ui/reatomMemo'

export type ActorSettingsFieldsProps = {
  side: Side
  sideConfig: MatchSideConfig
  onChange: (next: MatchSideConfig) => void
  errors: Record<string, Array<string>>
}

export const ActorSettingsFields = reatomMemo(({
  side,
  sideConfig,
  onChange,
  errors,
}: ActorSettingsFieldsProps) => {
  const descriptor = getRegisteredActor(sideConfig.actorKey)
  const SettingsComponent = descriptor.SettingsComponent as ComponentType<
    ActorSettingsProps<unknown>
  >

  return (
    <SettingsComponent
      side={side}
      value={sideConfig.actorConfig}
      onChange={(actorConfig) =>
        onChange({
          actorKey: descriptor.key,
          actorConfig,
        } as MatchSideConfig)
      }
      errors={errors}
    />
  )
}, 'ActorSettingsFields')
