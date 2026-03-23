import type { ActorMatchInfoProps, ActorSettingsProps } from '../../types'
import { AiProviderSettings, getOptionLabel } from '../providerSettings'
import { GOOGLE_MODEL_OPTIONS, type GoogleActorConfig } from './config.schema'
import { reatomMemo } from '@/shared/ui/reatomMemo'

export const GoogleActorSettings = reatomMemo(({
  value,
  onChange,
  errors,
}: ActorSettingsProps<GoogleActorConfig>) => {
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
      modelOptions={GOOGLE_MODEL_OPTIONS}
    />
  )
}, 'GoogleActorSettings')

export const GoogleActorMatchInfo = reatomMemo(({
  value,
}: ActorMatchInfoProps<GoogleActorConfig>) => {
  return (
    <dl>
      <div>
        <dt>Model</dt>
        <dd>{getOptionLabel(GOOGLE_MODEL_OPTIONS, value.model)}</dd>
      </div>
    </dl>
  )
}, 'GoogleActorMatchInfo')
