import type { ActorMatchInfoProps, ActorSettingsProps } from '../../types'
import { AiProviderSettings, getOptionLabel } from '../providerSettings'
import {
  ANTHROPIC_MODEL_OPTIONS,
  type AnthropicActorConfig,
} from './config.schema'
import { reatomMemo } from '@/shared/ui/reatomMemo'

export const AnthropicActorSettings = reatomMemo(({
  value,
  onChange,
  errors,
}: ActorSettingsProps<AnthropicActorConfig>) => {
  return (
    <AiProviderSettings
      value={value}
      onChange={(next) =>
        onChange({
          ...value,
          apiKey: next.apiKey,
          model: next.model,
        })
      }
      errors={errors}
      modelOptions={ANTHROPIC_MODEL_OPTIONS}
    />
  )
}, 'AnthropicActorSettings')

export const AnthropicActorMatchInfo = reatomMemo(({
  value,
}: ActorMatchInfoProps<AnthropicActorConfig>) => {
  return (
    <dl>
      <div>
        <dt>Model</dt>
        <dd>{getOptionLabel(ANTHROPIC_MODEL_OPTIONS, value.model)}</dd>
      </div>
    </dl>
  )
}, 'AnthropicActorMatchInfo')
