import type { ActorMatchInfoProps, ActorSettingsProps } from '../../types'
import { AiProviderSettings, getOptionLabel } from '../providerSettings'
import {
  OPENAI_MODEL_OPTIONS,
  OPENAI_REASONING_OPTIONS,
  type OpenAiActorConfig,
} from './config.schema'
import { reatomMemo } from '@/shared/ui/reatomMemo'

const FieldErrorList = reatomMemo(({
  errors,
}: {
  errors: Array<string> | undefined
}) => {
  if (!errors || errors.length === 0) {
    return null
  }

  return (
    <ul>
      {errors.map((error) => (
        <li key={error}>{error}</li>
      ))}
    </ul>
  )
}, 'FieldErrorList')

export const OpenAiActorSettings = reatomMemo(({
  value,
  onChange,
  errors,
}: ActorSettingsProps<OpenAiActorConfig>) => {
  return (
    <div>
      <AiProviderSettings
        actorKey="openai"
        value={value}
        onChange={(next) =>
          onChange({
            ...value,
            model: next.model,
          })
        }
        errors={errors}
        modelOptions={OPENAI_MODEL_OPTIONS}
      />
      <label>
        <span>Reasoning effort</span>
        <select
          value={value.reasoningEffort}
          onChange={(event) =>
            onChange({
              ...value,
              reasoningEffort: event.target.value as OpenAiActorConfig['reasoningEffort'],
            })
          }
        >
          {OPENAI_REASONING_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <FieldErrorList errors={errors.reasoningEffort} />
    </div>
  )
}, 'OpenAiActorSettings')

export const OpenAiActorMatchInfo = reatomMemo(({
  value,
}: ActorMatchInfoProps<OpenAiActorConfig>) => {
  return (
    <dl>
      <div>
        <dt>Model</dt>
        <dd>{getOptionLabel(OPENAI_MODEL_OPTIONS, value.model)}</dd>
      </div>
      <div>
        <dt>Reasoning effort</dt>
        <dd>{getOptionLabel(OPENAI_REASONING_OPTIONS, value.reasoningEffort)}</dd>
      </div>
    </dl>
  )
}, 'OpenAiActorMatchInfo')
