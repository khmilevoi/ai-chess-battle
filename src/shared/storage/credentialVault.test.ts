import { action, atom, withAsync } from '@reatom/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const STORAGE_KEY = 'ai-chess-battle.credential-vault'

describe('credentialVault', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.resetModules()
  })

  it('encrypts secrets at rest and restores them after unlock', async () => {
    const vault = await import('./credentialVault')

    expect(vault.readVaultStatus()).toBe('unconfigured')
    expect(await vault.setupVault('test-master-password')).toBeNull()
    expect(vault.readVaultStatus()).toBe('unlocked')

    expect(await vault.setSecret('openai', 'sk-test-openai')).toBeNull()
    expect(vault.getSecret('openai')).toBe('sk-test-openai')

    const raw = window.localStorage.getItem(STORAGE_KEY)

    expect(raw).toEqual(expect.any(String))
    expect(raw).not.toContain('sk-test-openai')

    vault.lockVault()

    expect(vault.readVaultStatus()).toBe('locked')
    expect(vault.getSecret('openai')).toBeNull()
    expect(await vault.unlockVault('test-master-password')).toBeNull()
    expect(vault.getSecret('openai')).toBe('sk-test-openai')
  }, 20000)

  it('starts locked on a fresh session and rejects a wrong password', async () => {
    const vault = await import('./credentialVault')

    expect(await vault.setupVault('correct-password')).toBeNull()
    expect(await vault.setSecret('google', 'google-test-key')).toBeNull()

    vi.resetModules()

    const reloadedVault = await import('./credentialVault')

    expect(reloadedVault.readVaultStatus()).toBe('locked')
    expect(reloadedVault.getSecret('google')).toBeNull()
    expect(await reloadedVault.unlockVault('wrong-password')).toBeInstanceOf(Error)
    expect(reloadedVault.readVaultStatus()).toBe('locked')
    expect(await reloadedVault.unlockVault('correct-password')).toBeNull()
    expect(reloadedVault.getSecret('google')).toBe('google-test-key')
  }, 20000)

  it('resets the vault and clears persisted secrets', async () => {
    const vault = await import('./credentialVault')

    expect(await vault.setupVault('test-master-password')).toBeNull()
    expect(await vault.setSecret('anthropic', 'anthropic-test-key')).toBeNull()

    vault.resetVault()

    expect(vault.readVaultStatus()).toBe('unconfigured')
    expect(vault.getSecret('anthropic')).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('exposes async lifecycle methods on vault mutations', async () => {
    const vault = await import('./credentialVault')

    expect(typeof vault.setupVault.ready).toBe('function')
    expect(typeof vault.unlockVault.ready).toBe('function')
    expect(typeof vault.setSecret.ready).toBe('function')
    expect(typeof vault.clearSecret.ready).toBe('function')
  })

  it('preserves Reatom context across awaited vault mutations inside another action', async () => {
    const vault = await import('./credentialVault')
    const status = atom<'idle' | 'after'>('idle', 'test.vault.status')

    const run = action(async () => {
      const startStatus = vault.readVaultStatus()

      expect(startStatus).toBe('unconfigured')

      expect(await vault.setupVault('test-master-password')).toBeNull()
      status.set('after')

      expect(vault.readVaultStatus()).toBe('unlocked')

      return null
    }, 'test.vault.outer').extend(withAsync())

    expect(await run()).toBeNull()
    expect(status()).toBe('after')
  })
})
