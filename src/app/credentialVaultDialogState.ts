import { action, atom } from '@reatom/core'

export const credentialVaultDialogOpenAtom = atom(
  false,
  'app.credentialVaultDialog.open',
)

export const credentialVaultNoticeAtom = atom<string | null>(
  null,
  'app.credentialVaultDialog.notice',
)

export const openCredentialVaultDialog = action(() => {
  credentialVaultDialogOpenAtom.set(true)
  return null
}, 'app.credentialVaultDialog.openAction')

export const closeCredentialVaultDialog = action(() => {
  credentialVaultDialogOpenAtom.set(false)
  return null
}, 'app.credentialVaultDialog.closeAction')

export const setCredentialVaultNotice = action((message: string | null) => {
  credentialVaultNoticeAtom.set(message)
  return message
}, 'app.credentialVaultDialog.setNotice')
