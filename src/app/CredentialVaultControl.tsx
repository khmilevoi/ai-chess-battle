import { KeyRound, Lock, LockOpen } from 'lucide-react'
import { Button } from '@/shared/ui/Button'
import { vaultStatusAtom } from '@/shared/storage/credentialVault'
import { reatomMemo } from '@/shared/ui/reatomMemo'
import {
  credentialVaultNoticeAtom,
  openCredentialVaultDialog,
} from './credentialVaultDialogState'
import styles from './App.module.css'

function renderVaultIcon(status: 'unconfigured' | 'locked' | 'unlocked') {
  if (status === 'unlocked') return <LockOpen size={16} aria-hidden />
  if (status === 'locked') return <Lock size={16} aria-hidden />
  return <KeyRound size={16} aria-hidden />
}

export const CredentialVaultControl = reatomMemo(() => {
  const vaultStatus = vaultStatusAtom()
  const notice = credentialVaultNoticeAtom()

  const statusLabel =
    vaultStatus === 'unconfigured'
      ? 'setup needed'
      : vaultStatus === 'locked'
        ? 'locked'
        : 'ready'
  const actionLabel =
    vaultStatus === 'unconfigured'
      ? 'Set up vault'
      : vaultStatus === 'locked'
        ? 'Unlock vault'
        : 'Manage vault'

  return (
    <div className={styles.vaultControl} aria-label="Credential vault">
      <span
        className={styles.vaultLabel}
        data-unconfigured={vaultStatus === 'unconfigured' || undefined}
      >
        {statusLabel}
      </span>
      <Button
        className={styles.vaultButton}
        aria-label={actionLabel}
        title={actionLabel}
        onClick={() => {
          openCredentialVaultDialog()
        }}
      >
        {renderVaultIcon(vaultStatus)}
      </Button>
      {notice ? <span className={styles.vaultNotice}>{notice}</span> : null}
    </div>
  )
}, 'CredentialVaultControl')
