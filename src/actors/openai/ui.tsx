import type { ReactNode } from 'react'
import type { ActorSettingsProps } from '../types'
import type { OpenAiActorConfig } from './config.schema'

function FieldErrorList({
  errors,
}: {
  errors: Array<string> | undefined
}): ReactNode {
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
}

export function OpenAiActorSettings({
  value,
  onChange,
  errors,
}: ActorSettingsProps<OpenAiActorConfig>) {
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
        <input
          type="text"
          value={value.model}
          onChange={(event) =>
            onChange({
              ...value,
              model: event.target.value,
            })
          }
          spellCheck={false}
        />
      </label>
      <FieldErrorList errors={errors.model} />
    </div>
  )
}
