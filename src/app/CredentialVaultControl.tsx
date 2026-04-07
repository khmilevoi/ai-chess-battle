import { Button } from '@/shared/ui/Button'
import { vaultStatusAtom } from '@/shared/storage/credentialVault'
import { reatomMemo } from '@/shared/ui/reatomMemo'
import {
  credentialVaultNoticeAtom,
  openCredentialVaultDialog,
} from './credentialVaultDialogState'
import styles from './App.module.css'

export const CredentialVaultControl = reatomMemo(() => {
  const vaultStatus = vaultStatusAtom()
  const message = credentialVaultNoticeAtom()

  const statusLabel =
    vaultStatus === 'unconfigured'
      ? 'No vault configured'
      : vaultStatus === 'locked'
      ? 'Vault locked'
      : 'Vault unlocked'
  const actionLabel =
    vaultStatus === 'unconfigured'
      ? 'Set up vault'
      : vaultStatus === 'locked'
      ? 'Unlock vault'
      : 'Manage vault'

  return (
    <section className={styles.vaultCard} aria-label="Credential vault">
      <div className={styles.vaultHeader}>
        <div>
          <p className={styles.vaultEyebrow}>Credential vault</p>
          <h2 className={styles.vaultTitle}>{statusLabel}</h2>
        </div>
      </div>
      <div className={styles.vaultActions}>
        <Button
          onClick={() => {
            openCredentialVaultDialog()
          }}
        >
          {actionLabel}
        </Button>
      </div>
      {message ? <p className={styles.vaultMessage}>{message}</p> : null}
    </section>
  )
}, 'CredentialVaultControl')
