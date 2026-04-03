import { action, atom, computed, peek, withAsync, withLocalStorage, wrap } from '@reatom/core'
import { StorageError, VaultLockedError } from '../errors'

const STORAGE_KEY = 'ai-chess-battle.credential-vault'
const STORAGE_VERSION = 'credential-vault@1'
const VAULT_DATA_VERSION = 1
const VAULT_VERIFIER = 'ai-chess-battle.credential-vault'
const PBKDF2_ITERATIONS = 250_000
const vaultActorKeys = ['openai', 'anthropic', 'google'] as const

export type VaultActorKey = (typeof vaultActorKeys)[number]

type VaultSecrets = Partial<Record<VaultActorKey, string>>

type StoredVaultRecord = {
  version: typeof VAULT_DATA_VERSION
  salt: string
  iv: string
  ciphertext: string
}

type VaultPayload = {
  verifier: typeof VAULT_VERIFIER
  secretsByActorKey: VaultSecrets
}

type VaultSession = {
  key: CryptoKey | null
  secretsByActorKey: VaultSecrets
}

export type VaultStatus = 'unconfigured' | 'locked' | 'unlocked'

const emptySession: VaultSession = {
  key: null,
  secretsByActorKey: {},
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isVaultActorKey(value: string): value is VaultActorKey {
  return vaultActorKeys.includes(value as VaultActorKey)
}

function normalizeSecrets(value: unknown): VaultSecrets {
  if (!isRecord(value)) {
    return {}
  }

  const secrets: VaultSecrets = {}

  for (const [key, secret] of Object.entries(value)) {
    if (!isVaultActorKey(key) || typeof secret !== 'string' || secret.length === 0) {
      continue
    }

    secrets[key] = secret
  }

  return secrets
}

function normalizeStoredVaultRecord(value: unknown): StoredVaultRecord | null {
  if (!isRecord(value)) {
    return null
  }

  if (
    value.version !== VAULT_DATA_VERSION ||
    typeof value.salt !== 'string' ||
    typeof value.iv !== 'string' ||
    typeof value.ciphertext !== 'string' ||
    value.salt.length === 0 ||
    value.iv.length === 0 ||
    value.ciphertext.length === 0
  ) {
    return null
  }

  return {
    version: VAULT_DATA_VERSION,
    salt: value.salt,
    iv: value.iv,
    ciphertext: value.ciphertext,
  }
}

function normalizeVaultPayload(value: unknown): VaultPayload | null {
  if (!isRecord(value)) {
    return null
  }

  if (value.verifier !== VAULT_VERIFIER) {
    return null
  }

  return {
    verifier: VAULT_VERIFIER,
    secretsByActorKey: normalizeSecrets(value.secretsByActorKey),
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(
    Uint8Array.from(atob(value), (char) => char.charCodeAt(0)),
  )
}

function toBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes)
}

async function deriveVaultKey(args: {
  password: string
  salt: Uint8Array
}) {
  const passwordMaterial = await wrap(
    crypto.subtle.importKey('raw', new TextEncoder().encode(args.password), 'PBKDF2', false, [
      'deriveKey',
    ]),
  ).catch((cause) => new StorageError({ message: 'Failed to import vault key material.', cause }))

  if (passwordMaterial instanceof Error) {
    return passwordMaterial
  }

  return await wrap(
    crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: toBufferSource(args.salt),
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      passwordMaterial,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false,
      ['encrypt', 'decrypt'],
    ),
  ).catch((cause) => new StorageError({ message: 'Failed to derive the vault key.', cause }))
}

async function encryptVaultPayload(args: {
  key: CryptoKey
  payload: VaultPayload
  salt: Uint8Array
}) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encodedPayload = new TextEncoder().encode(JSON.stringify(args.payload))
  const ciphertext = await wrap(
    crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      args.key,
      encodedPayload,
    ),
  ).catch((cause) =>
    new StorageError({ message: 'Failed to encrypt the credential vault.', cause }),
  )

  if (ciphertext instanceof Error) {
    return ciphertext
  }

  return {
    version: VAULT_DATA_VERSION,
    salt: bytesToBase64(args.salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  } satisfies StoredVaultRecord
}

async function decryptVaultPayload(args: {
  password: string
  record: StoredVaultRecord
}) {
  const salt = base64ToBytes(args.record.salt)
  const key = await deriveVaultKey({
    password: args.password,
    salt,
  })

  if (key instanceof Error) {
    return key
  }

  const decrypted = await wrap(
    crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toBufferSource(base64ToBytes(args.record.iv)),
      },
      key,
      toBufferSource(base64ToBytes(args.record.ciphertext)),
    ),
  ).catch(
    () =>
      new StorageError({
        message: 'Incorrect master password.',
      }),
  )

  if (decrypted instanceof Error) {
    return decrypted
  }

  const payload = normalizeVaultPayload(
    JSON.parse(new TextDecoder().decode(new Uint8Array(decrypted))),
  )

  if (payload === null) {
    return new StorageError({
      message: 'Stored credential vault payload is invalid.',
    })
  }

  return {
    key,
    payload,
  } as const
}

const storedVaultRecordAtom = atom<StoredVaultRecord | null>(null, 'storage.credentialVault').extend(
  withLocalStorage({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    migration: (persist) => normalizeStoredVaultRecord(persist),
    fromSnapshot: (snapshot, state) => {
      const normalized = normalizeStoredVaultRecord(snapshot)
      return normalized ?? state ?? null
    },
  }),
)

const vaultSessionAtom = atom<VaultSession>(emptySession, 'storage.credentialVault.session')

export const vaultStatusAtom = computed(() => {
  if (storedVaultRecordAtom() === null) {
    return 'unconfigured' as const
  }

  return vaultSessionAtom().key === null ? 'locked' : 'unlocked'
}, 'storage.credentialVault.status')

export const vaultSecretsAtom = computed(
  () => vaultSessionAtom().secretsByActorKey,
  'storage.credentialVault.secrets',
)

export function readVaultStatus(): VaultStatus {
  return peek(vaultStatusAtom)
}

export function getSecret(actorKey: string): string | null {
  if (!isVaultActorKey(actorKey)) {
    return null
  }

  return peek(vaultSessionAtom).secretsByActorKey[actorKey] ?? null
}

export const setupVault = action(async (password: string) => {
  if (peek(storedVaultRecordAtom) !== null) {
    return new StorageError({
      message: 'The credential vault is already configured.',
    })
  }

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveVaultKey({
    password,
    salt,
  })

  if (key instanceof Error) {
    return key
  }

  const record = await encryptVaultPayload({
    key,
    salt,
    payload: {
      verifier: VAULT_VERIFIER,
      secretsByActorKey: {},
    },
  })

  if (record instanceof Error) {
    return record
  }

  storedVaultRecordAtom.set(record)
  vaultSessionAtom.set({
    key,
    secretsByActorKey: {},
  })

  return null
}, 'storage.credentialVault.setupVault').extend(withAsync())

export const unlockVault = action(async (password: string) => {
  const record = peek(storedVaultRecordAtom)

  if (record === null) {
    return new StorageError({
      message: 'The credential vault has not been configured yet.',
    })
  }

  const decrypted = await decryptVaultPayload({
    password,
    record,
  })

  if (decrypted instanceof Error) {
    return decrypted
  }

  vaultSessionAtom.set({
    key: decrypted.key,
    secretsByActorKey: decrypted.payload.secretsByActorKey,
  })

  return null
}, 'storage.credentialVault.unlockVault').extend(withAsync())

export const lockVault = action(() => {
  vaultSessionAtom.set(emptySession)
  return null
}, 'storage.credentialVault.lockVault')

export const resetVault = action(() => {
  storedVaultRecordAtom.set(null)
  vaultSessionAtom.set(emptySession)
  window.localStorage.removeItem(STORAGE_KEY)
  return null
}, 'storage.credentialVault.resetVault')

async function persistSecrets(nextSecretsByActorKey: VaultSecrets) {
  const session = peek(vaultSessionAtom)
  const record = peek(storedVaultRecordAtom)

  if (session.key === null || record === null) {
    return new VaultLockedError()
  }

  const nextRecord = await encryptVaultPayload({
    key: session.key,
    salt: base64ToBytes(record.salt),
    payload: {
      verifier: VAULT_VERIFIER,
      secretsByActorKey: nextSecretsByActorKey,
    },
  })

  if (nextRecord instanceof Error) {
    return nextRecord
  }

  storedVaultRecordAtom.set(nextRecord)
  vaultSessionAtom.set({
    key: session.key,
    secretsByActorKey: nextSecretsByActorKey,
  })

  return null
}

export const setSecret = action(async (actorKey: VaultActorKey, secret: string) => {
  const currentSecretsByActorKey = peek(vaultSessionAtom).secretsByActorKey
  const nextSecretsByActorKey = {
    ...currentSecretsByActorKey,
    [actorKey]: secret,
  } satisfies VaultSecrets

  return await persistSecrets(nextSecretsByActorKey)
}, 'storage.credentialVault.setSecret').extend(withAsync())

export const clearSecret = action(async (actorKey: VaultActorKey) => {
  const currentSecretsByActorKey = peek(vaultSessionAtom).secretsByActorKey
  const nextSecretsByActorKey = Object.fromEntries(
    Object.entries(currentSecretsByActorKey).filter(([key]) => key !== actorKey),
  ) as VaultSecrets

  return await persistSecrets(nextSecretsByActorKey)
}, 'storage.credentialVault.clearSecret').extend(withAsync())
