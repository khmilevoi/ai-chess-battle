import {
  resetVault,
  setSecret,
  setupVault,
  type VaultActorKey,
} from '@/shared/storage/credentialVault'

export const TEST_MASTER_PASSWORD = 'test-master-password'

export const DEFAULT_TEST_VAULT_SECRETS = {
  openai: 'sk-test',
  anthropic: 'anthropic-test',
  google: 'google-test',
} satisfies Record<VaultActorKey, string>

export async function setupTestVault(
  secrets: Partial<Record<VaultActorKey, string>> = DEFAULT_TEST_VAULT_SECRETS,
) {
  resetVault()

  const setupResult = await setupVault(TEST_MASTER_PASSWORD)

  if (setupResult instanceof Error) {
    throw setupResult
  }

  for (const [actorKey, secret] of Object.entries(secrets)) {
    if (!secret) {
      continue
    }

    const setResult = await setSecret(actorKey as VaultActorKey, secret)

    if (setResult instanceof Error) {
      throw setResult
    }
  }
}
