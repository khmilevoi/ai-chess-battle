import type { ActorMatchInfoProps, ActorSettingsProps } from '../../types'
import { AiProviderSettings, getOptionLabel } from '@/shared/ai-providers/ui/AiProviderSettings'
import {
  ANTHROPIC_EFFORT_OPTIONS,
  ANTHROPIC_MODEL_OPTIONS,
  type AnthropicActorConfig,
  getAnthropicEffortOptions,
  normalizeAnthropicEffort,
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

export const AnthropicActorSettings = reatomMemo(({
  value,
  onChange,
  errors,
}: ActorSettingsProps<AnthropicActorConfig>) => {
  const effortOptions = getAnthropicEffortOptions(value.model)
  const normalizedEffort = normalizeAnthropicEffort(value.model, value.effort)

  return (
    <div>
      <AiProviderSettings
        actorKey="anthropic"
        value={value}
        onChange={(next) =>
          onChange({
            ...value,
            model: next.model,
            effort: normalizeAnthropicEffort(next.model, value.effort),
          })
        }
        errors={errors}
        modelOptions={ANTHROPIC_MODEL_OPTIONS}
      />
      {effortOptions.length > 0 ? (
        <>
          <label>
            <span>Effort</span>
            <select
              value={normalizedEffort}
              onChange={(event) =>
                onChange({
                  ...value,
                  effort: event.target.value as AnthropicActorConfig['effort'],
                })
              }
            >
              {effortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <FieldErrorList errors={errors.effort} />
        </>
      ) : null}
    </div>
  )
}, 'AnthropicActorSettings')

export const AnthropicActorMatchInfo = reatomMemo(({
  value,
}: ActorMatchInfoProps<AnthropicActorConfig>) => {
  const effortOptions = getAnthropicEffortOptions(value.model)

  return (
    <dl>
      <div>
        <dt>Model</dt>
        <dd>{getOptionLabel(ANTHROPIC_MODEL_OPTIONS, value.model)}</dd>
      </div>
      {effortOptions.length > 0 ? (
        <div>
          <dt>Effort</dt>
          <dd>
            {getOptionLabel(
              ANTHROPIC_EFFORT_OPTIONS,
              normalizeAnthropicEffort(value.model, value.effort),
            )}
          </dd>
        </div>
      ) : null}
    </dl>
  )
}, 'AnthropicActorMatchInfo')
