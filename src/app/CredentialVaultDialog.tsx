import { useEffect, useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { Dialog } from '@/shared/ui/Dialog'
import { presentError } from '@/shared/errors'
import {
  lockVault,
  resetVault,
  setupVault,
  unlockVault,
  vaultStatusAtom,
} from '@/shared/storage/credentialVault'
import { reatomMemo } from '@/shared/ui/reatomMemo'
import {
  closeCredentialVaultDialog,
  credentialVaultDialogOpenAtom,
  setCredentialVaultNotice,
} from './credentialVaultDialogState'
import styles from './App.module.css'

function getDialogTitle(vaultStatus: ReturnType<typeof vaultStatusAtom>) {
  if (vaultStatus === 'unconfigured') {
    return 'Set up credential vault'
  }

  if (vaultStatus === 'locked') {
    return 'Unlock credential vault'
  }

  return 'Manage credential vault'
}

export const CredentialVaultDialog = reatomMemo(() => {
  const open = credentialVaultDialogOpenAtom()
  const vaultStatus = vaultStatusAtom()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const clearForm = () => {
    setPassword('')
    setConfirmPassword('')
  }

  useEffect(() => {
    if (!open) {
      return
    }

    clearForm()
    setMessage(null)
    setIsSubmitting(false)
  }, [open])

  const closeDialog = () => {
    if (isSubmitting) {
      return
    }

    closeCredentialVaultDialog()
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

    setIsSubmitting(true)
    const result = await setupVault(password)
    setIsSubmitting(false)

    if (result instanceof Error) {
      setMessage(presentError(result))
      return
    }

    clearForm()
    setMessage(null)
    setCredentialVaultNotice('Credential vault is ready in this tab.')
    closeCredentialVaultDialog()
  }

  const submitUnlock = async () => {
    if (password.length === 0) {
      setMessage('Master password is required.')
      return
    }

    setIsSubmitting(true)
    const result = await unlockVault(password)
    setIsSubmitting(false)

    if (result instanceof Error) {
      setMessage(presentError(result))
      return
    }

    clearForm()
    setMessage(null)
    setCredentialVaultNotice('Credential vault unlocked.')
    closeCredentialVaultDialog()
  }

  return (
    <Dialog
      open={open}
      title={getDialogTitle(vaultStatus)}
      onClose={closeDialog}
      dismissible={!isSubmitting}
    >
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
            <Button disabled={isSubmitting} onClick={() => void submitSetup()}>
              Set up vault
            </Button>
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
            <Button disabled={isSubmitting} onClick={() => void submitUnlock()}>
              Unlock vault
            </Button>
          </div>
        </div>
      ) : null}

      {vaultStatus === 'unlocked' ? (
        <div className={styles.vaultForm}>
          <p className={styles.vaultMessage}>
            Stored API keys stay encrypted in this browser profile until you lock or
            reset the vault.
          </p>
          <div className={styles.vaultActions}>
            <Button
              onClick={() => {
                lockVault()
                clearForm()
                setMessage(null)
                setCredentialVaultNotice('Credential vault locked.')
                closeCredentialVaultDialog()
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
                setMessage(null)
                setCredentialVaultNotice('Credential vault reset.')
              }}
            >
              Reset vault
            </Button>
          </div>
        </div>
      ) : null}

      {message ? <p className={styles.vaultMessage}>{message}</p> : null}
    </Dialog>
  )
}, 'CredentialVaultDialog')
