import { getRegisteredArbiter } from '@/arbiter/registry'
import {
  isArbiterPersonalityKey,
  listArbiterPersonalities,
} from '@/arbiter/personalities'
import type { ArbiterSideConfig } from '@/arbiter/types'
import { AiProviderSettings } from '@/shared/ai-providers/ui/AiProviderSettings'
import { reatomMemo } from '@/shared/ui/reatomMemo'

const personalityOptions = listArbiterPersonalities()

const FieldErrorList = reatomMemo(({
  id,
  errors,
}: {
  id?: string
  errors: Array<string> | undefined
}) => {
  if (!errors || errors.length === 0) {
    return null
  }

  return (
    <ul id={id} role="alert" aria-live="polite">
      {errors.map((error) => (
        <li key={error}>{error}</li>
      ))}
    </ul>
  )
}, 'ArbiterProviderSettings.FieldErrorList')

export const ArbiterProviderSettings = reatomMemo(({
  value,
  onChange,
  errors,
}: {
  value: ArbiterSideConfig
  onChange: (next: ArbiterSideConfig) => void
  errors: Record<string, Array<string>>
}) => {
  const descriptor = getRegisteredArbiter(value.arbiterKey)
  const personalityErrorId = `${value.arbiterKey}-arbiter-personality-error`
  const hasPersonalityError = (errors.personalityKey?.length ?? 0) > 0

  return (
    <>
      <AiProviderSettings
        actorKey={value.arbiterKey}
        value={{
          apiKey: '',
          model: value.arbiterConfig.model,
        }}
        onChange={(next) =>
          onChange({
            arbiterKey: value.arbiterKey,
            arbiterConfig: {
              model: next.model,
              personalityKey: value.arbiterConfig.personalityKey,
            },
          } as ArbiterSideConfig)
        }
        errors={errors}
        modelOptions={descriptor.modelOptions}
      />
      <label>
        <span>Personality</span>
        <select
          value={value.arbiterConfig.personalityKey}
          aria-label="Personality"
          aria-invalid={hasPersonalityError || undefined}
          aria-describedby={hasPersonalityError ? personalityErrorId : undefined}
          onChange={(event) => {
            const nextPersonalityKey = event.target.value

            if (!isArbiterPersonalityKey(nextPersonalityKey)) {
              return
            }

            onChange({
              arbiterKey: value.arbiterKey,
              arbiterConfig: {
                model: value.arbiterConfig.model,
                personalityKey: nextPersonalityKey,
              },
            } as ArbiterSideConfig)
          }}
        >
          {personalityOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.displayName}
            </option>
          ))}
        </select>
      </label>
      <FieldErrorList
        id={personalityErrorId}
        errors={errors.personalityKey}
      />
    </>
  )
}, 'ArbiterProviderSettings')
