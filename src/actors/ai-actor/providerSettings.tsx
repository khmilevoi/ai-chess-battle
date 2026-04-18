import { Button } from '@/shared/ui/Button'
import { reatomMemo } from '@/shared/ui/reatomMemo'
import { openCredentialVaultDialog } from '@/app/credentialVaultDialogState'
import {
  clearSecret,
  setSecret,
  vaultSecretsAtom,
  vaultStatusAtom,
} from '@/shared/storage/credentialVault'
import styles from './providerSettings.module.css'

export type AiProviderModelOption = {
  value: string
  label: string
  hint?: string
}

type LabeledOption = {
  value: string
  label: string
}

type AiProviderSettingsValue = {
  apiKey: string
  model: string
}

type AiProviderSettingsProps = {
  actorKey: 'openai' | 'anthropic' | 'google'
  value: AiProviderSettingsValue
  onChange: (next: AiProviderSettingsValue) => void
  errors: Record<string, Array<string>>
  modelOptions: ReadonlyArray<AiProviderModelOption>
}

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
}, 'FieldErrorList')

export const AiProviderSettings = reatomMemo(({
  actorKey,
  value,
  onChange,
  errors,
  modelOptions,
}: AiProviderSettingsProps) => {
  const vaultStatus = vaultStatusAtom()
  const storedSecret = vaultSecretsAtom()[actorKey] ?? ''
  const vaultHint =
    vaultStatus === 'unconfigured'
      ? 'Create the vault to save this API key.'
      : vaultStatus === 'locked'
      ? 'Unlock the vault to edit this API key.'
      : storedSecret.length > 0
      ? 'Stored in the encrypted local vault for this browser profile.'
      : 'Enter an API key to save it in the encrypted local vault.'
  const vaultActionLabel =
    vaultStatus === 'unconfigured'
      ? 'Set up vault'
      : vaultStatus === 'locked'
      ? 'Unlock vault'
      : null

  const apiKeyErrorId = `${actorKey}-apiKey-error`
  const modelErrorId = `${actorKey}-model-error`
  const hasApiKeyError = (errors.apiKey?.length ?? 0) > 0
  const hasModelError = (errors.model?.length ?? 0) > 0

  return (
    <div>
      <label>
        <span>API key</span>
        <input
          type="password"
          value={vaultStatus === 'unlocked' ? storedSecret : ''}
          disabled={vaultStatus !== 'unlocked'}
          aria-invalid={hasApiKeyError || undefined}
          aria-describedby={hasApiKeyError ? apiKeyErrorId : undefined}
          onChange={(event) => {
            const nextSecret = event.target.value
            const persistSecret =
              nextSecret.length === 0
                ? clearSecret(actorKey)
                : setSecret(actorKey, nextSecret)

            void persistSecret.then((result) => {
              if (!(result instanceof Error)) {
                return
              }

              console.warn(result)
            })
          }}
          autoComplete="off"
          spellCheck={false}
          placeholder={
            vaultStatus === 'unconfigured'
              ? 'Set up vault to edit'
              : vaultStatus === 'locked'
              ? 'Unlock vault to edit'
              : ''
          }
        />
      </label>
      <FieldErrorList id={apiKeyErrorId} errors={errors.apiKey} />
      <div className={styles.vaultAssist}>
        <p className={styles.vaultHint}>{vaultHint}</p>
        {vaultActionLabel ? (
          <Button
            className={styles.vaultAction}
            onClick={() => {
              openCredentialVaultDialog()
            }}
          >
            {vaultActionLabel}
          </Button>
        ) : null}
      </div>
      <label>
        <span>Model</span>
        <select
          value={value.model}
          aria-invalid={hasModelError || undefined}
          aria-describedby={hasModelError ? modelErrorId : undefined}
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
      <FieldErrorList id={modelErrorId} errors={errors.model} />
    </div>
  )
}, 'AiProviderSettings')

export function getOptionLabel<Option extends LabeledOption>(
  options: ReadonlyArray<Option>,
  value: string,
): string {
  return options.find((option) => option.value === value)?.label ?? value
}
