import type { ActorSettingsProps } from '../../types'
import { AiProviderSettings } from '../providerSettings'
import {
  ANTHROPIC_MODEL_OPTIONS,
  type AnthropicActorConfig,
} from './config.schema'
import { reatomMemo } from '../../../shared/ui/reatomMemo'

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
