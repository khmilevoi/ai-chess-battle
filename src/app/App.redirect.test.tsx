import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { urlAtom } from '@reatom/core'
import { clearStoredActorConfigMap } from '@/shared/storage/actorConfigStorage'
import { resetVault } from '@/shared/storage/credentialVault'
import { clearStoredGameArchive } from '@/shared/storage/gameSessionStorage'
import { storedMatchConfig } from '@/shared/storage/matchConfigStorage'
import { setupRoute } from './routes'
import { App } from './App'

function syncCurrentUrl() {
  urlAtom.syncFromSource(new URL(window.location.href), true)
}

describe('App redirects', () => {
  beforeEach(() => {
    clearStoredActorConfigMap()
    storedMatchConfig.clear()
    clearStoredGameArchive()
    window.localStorage.clear()
    resetVault()
    window.history.replaceState({}, '', '/')
    syncCurrentUrl()
    setupRoute.go(undefined, true)
  })

  it('redirects incomplete /game to /games', async () => {
    window.history.replaceState({}, '', '/game')
    syncCurrentUrl()

    render(<App />)
    syncCurrentUrl()

    await waitFor(() => {
      expect(window.location.pathname).toBe('/games')
    })
    await screen.findByRole('heading', { name: 'Saved games' }, { timeout: 5000 })
  })
})
