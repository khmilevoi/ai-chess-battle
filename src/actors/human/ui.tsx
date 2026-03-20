import type { ActorSettingsProps } from '../types'
import type { HumanActorConfig } from './config.schema'

export function HumanActorSettings({
  side,
}: ActorSettingsProps<HumanActorConfig>) {
  return (
    <div>
      <p>{side === 'white' ? 'White' : 'Black'} will wait for board input.</p>
    </div>
  )
}
