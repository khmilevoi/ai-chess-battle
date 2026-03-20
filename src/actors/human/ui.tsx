import type { ActorSettingsProps } from '../types'
import type { HumanActorConfig } from './config.schema'
import { reatomMemo } from '../../shared/ui/reatomMemo'

export const HumanActorSettings = reatomMemo(({
  side,
}: ActorSettingsProps<HumanActorConfig>) => {
  return (
    <div>
      <p>{side === 'white' ? 'White' : 'Black'} will wait for board input.</p>
    </div>
  )
}, 'HumanActorSettings')
