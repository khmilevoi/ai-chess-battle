import { useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { presentError } from '@/shared/errors'
import {
  lockVault,
  resetVault,
  setupVault,
  unlockVault,
  vaultStatusAtom,
} from '@/shared/storage/credentialVault'
import { reatomMemo } from '@/shared/ui/reatomMemo'
import styles from './App.module.css'

export const CredentialVaultControl = reatomMemo(() => {
  const vaultStatus = vaultStatusAtom()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const clearForm = () => {
    setPassword('')
    setConfirmPassword('')
  }

  const submitSetup = async () => {
    if (password.length === 0) {
      setMessage('Master password is required.')
      return
    }

    if (password !== confirmPassword) {
      setMessage('Passwords do not match.')
      return
    }

    const result = await setupVault(password)

    if (result instanceof Error) {
      setMessage(presentError(result))
      return
    }

    clearForm()
    setMessage('Credential vault is ready in this tab.')
  }

  const submitUnlock = async () => {
    if (password.length === 0) {
      setMessage('Master password is required.')
      return
    }

    const result = await unlockVault(password)

    if (result instanceof Error) {
      setMessage(presentError(result))
      return
    }

    clearForm()
    setMessage('Credential vault unlocked.')
  }

  const statusLabel =
    vaultStatus === 'unconfigured'
      ? 'No vault configured'
      : vaultStatus === 'locked'
      ? 'Vault locked'
      : 'Vault unlocked'

  return (
    <section className={styles.vaultCard} aria-label="Credential vault">
      <div className={styles.vaultHeader}>
        <div>
          <p className={styles.vaultEyebrow}>Credential vault</p>
          <h2 className={styles.vaultTitle}>{statusLabel}</h2>
        </div>
        {vaultStatus === 'unlocked' ? (
          <div className={styles.vaultActions}>
            <Button
              onClick={() => {
                lockVault()
                clearForm()
                setMessage('Credential vault locked.')
              }}
            >
              Lock vault
            </Button>
            <Button
              onClick={() => {
                if (
                  !window.confirm(
                    'Reset the encrypted vault? Stored API keys will be removed and must be entered again.',
                  )
                ) {
                  return
                }

                resetVault()
                clearForm()
                setMessage('Credential vault reset.')
              }}
            >
              Reset vault
            </Button>
          </div>
        ) : null}
      </div>

      {vaultStatus === 'unconfigured' ? (
        <div className={styles.vaultForm}>
          <label>
            <span>Master password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="off"
            />
          </label>
          <label>
            <span>Confirm password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="off"
            />
          </label>
          <div className={styles.vaultActions}>
            <Button onClick={() => void submitSetup()}>Set master password</Button>
          </div>
        </div>
      ) : null}

      {vaultStatus === 'locked' ? (
        <div className={styles.vaultForm}>
          <label>
            <span>Master password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="off"
            />
          </label>
          <div className={styles.vaultActions}>
            <Button onClick={() => void submitUnlock()}>Unlock vault</Button>
          </div>
        </div>
      ) : null}

      {message ? <p className={styles.vaultMessage}>{message}</p> : null}
    </section>
  )
}, 'CredentialVaultControl')
