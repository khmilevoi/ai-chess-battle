import type { ActorSettingsProps } from '../../types'
import {
  OPENAI_MODEL_OPTIONS,
  OPENAI_REASONING_OPTIONS,
  type OpenAiActorConfig,
} from './config.schema'
import { reatomMemo } from '../../../shared/ui/reatomMemo'

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
      <label>
        <span>API key</span>
        <input
          type="password"
          value={value.apiKey}
          onChange={(event) =>
            onChange({
              ...value,
              apiKey: event.target.value,
            })
          }
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <FieldErrorList errors={errors.apiKey} />
      <label>
        <span>Model</span>
        <select
          value={value.model}
          onChange={(event) =>
            onChange({
              ...value,
              model: event.target.value,
            })
          }
        >
          {OPENAI_MODEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <FieldErrorList errors={errors.model} />
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
