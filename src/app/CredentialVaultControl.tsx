import { Button } from '@/shared/ui/Button'
import { vaultStatusAtom } from '@/shared/storage/credentialVault'
import { reatomMemo } from '@/shared/ui/reatomMemo'
import {
  credentialVaultNoticeAtom,
  openCredentialVaultDialog,
} from './credentialVaultDialogState'
import { KeyIcon } from './KeyIcon'
import styles from './App.module.css'

export const CredentialVaultControl = reatomMemo(() => {
  const vaultStatus = vaultStatusAtom()
  const notice = credentialVaultNoticeAtom()

  const statusLabel =
    vaultStatus === 'unconfigured'
      ? 'Setup needed'
      : vaultStatus === 'locked'
        ? 'Locked'
        : 'Ready'
  const actionLabel =
    vaultStatus === 'unconfigured'
      ? 'Set up vault'
      : vaultStatus === 'locked'
        ? 'Unlock vault'
        : 'Manage vault'

  return (
    <section className={styles.vaultCard} aria-label="Credential vault">
      <p className={styles.vaultStatus}>{statusLabel}</p>
      <div className={styles.vaultActions}>
        <Button
          className={styles.vaultButton}
          aria-label={actionLabel}
          title={actionLabel}
          onClick={() => {
            openCredentialVaultDialog()
          }}
        >
          <KeyIcon />
        </Button>
      </div>
      {notice ? <p className={styles.vaultMessage}>{notice}</p> : null}
    </section>
  )
}, 'CredentialVaultControl')
