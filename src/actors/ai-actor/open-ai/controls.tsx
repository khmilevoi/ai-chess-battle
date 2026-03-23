import type { ActorControlsProps } from '../../types'
import { AiActorControls } from '../controls'
import type { OpenAiActorRuntime } from './model'
import { reatomMemo } from '@/shared/ui/reatomMemo'

export const OpenAiActorControls = reatomMemo(({
  side,
  sides,
  activeSide,
  actor,
}: ActorControlsProps<OpenAiActorRuntime>) => {
  return (
    <AiActorControls
      side={side}
      sides={sides}
      activeSide={activeSide}
      actor={actor}
      providerLabel="OpenAI"
    />
  )
}, 'OpenAiActorControls')
