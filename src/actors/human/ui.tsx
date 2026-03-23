import type { ActorMatchInfoProps, ActorSettingsProps } from '../types'
import type { HumanActorConfig } from './config.schema'
import { reatomMemo } from '@/shared/ui/reatomMemo'

export const HumanActorSettings = reatomMemo(({
  side,
}: ActorSettingsProps<HumanActorConfig>) => {
  return (
    <div>
      <p>{side === 'white' ? 'White' : 'Black'} will wait for board input.</p>
    </div>
  )
}, 'HumanActorSettings')

export const HumanActorMatchInfo = reatomMemo(({
  side,
}: ActorMatchInfoProps<HumanActorConfig>) => {
  return (
    <p>{side === 'white' ? 'White' : 'Black'} moves are entered directly on the board.</p>
  )
}, 'HumanActorMatchInfo')
