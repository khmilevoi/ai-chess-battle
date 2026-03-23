import type { ActorControlsProps } from '../../types'
import { AiActorControls } from '../controls'
import { reatomMemo } from '@/shared/ui/reatomMemo'
import type { GoogleActorRuntime } from './model'

export const GoogleActorControls = reatomMemo(({
  side,
  sides,
  activeSide,
  actor,
}: ActorControlsProps<GoogleActorRuntime>) => {
  return (
    <AiActorControls
      side={side}
      sides={sides}
      activeSide={activeSide}
      actor={actor}
      providerLabel="Gemini"
    />
  )
}, 'GoogleActorControls')
