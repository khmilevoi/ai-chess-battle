import { reatomMemo } from '@/shared/ui/reatomMemo'

export type AiProviderModelOption = {
  value: string
  label: string
  hint?: string
}

type AiProviderSettingsValue = {
  apiKey: string
  model: string
}

type AiProviderSettingsProps = {
  value: AiProviderSettingsValue
  onChange: (next: AiProviderSettingsValue) => void
  errors: Record<string, Array<string>>
  modelOptions: ReadonlyArray<AiProviderModelOption>
}

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

export const AiProviderSettings = reatomMemo(({
  value,
  onChange,
  errors,
  modelOptions,
}: AiProviderSettingsProps) => {
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
          {modelOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <FieldErrorList errors={errors.model} />
    </div>
  )
}, 'AiProviderSettings')
