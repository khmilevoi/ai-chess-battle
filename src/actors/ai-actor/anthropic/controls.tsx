import type { ActorControlsProps } from '../../types'
import { AiActorControls } from '../controls'
import { reatomMemo } from '@/shared/ui/reatomMemo'
import type { AnthropicActorRuntime } from './model'

export const AnthropicActorControls = reatomMemo(({
  side,
  sides,
  activeSide,
  actor,
}: ActorControlsProps<AnthropicActorRuntime>) => {
  return (
    <AiActorControls
      side={side}
      sides={sides}
      activeSide={activeSide}
      actor={actor}
      providerLabel="Anthropic"
    />
  )
}, 'AnthropicActorControls')
