import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { urlAtom } from '@reatom/core'
import { clearStoredActorConfigMap } from '../shared/storage/actorConfigStorage'
import { clearStoredGameSession } from '../shared/storage/gameSessionStorage'
import { storedMatchConfig } from '../shared/storage/matchConfigStorage'
import { matchSessionConfig } from './model'
import { setupRoute } from './routes'
import { App } from './App'

function syncCurrentUrl() {
  urlAtom.syncFromSource(new URL(window.location.href), true)
}

describe('App redirects', () => {
  beforeEach(() => {
    clearStoredActorConfigMap()
    storedMatchConfig.set(null)
    clearStoredGameSession()
    window.localStorage.clear()
    matchSessionConfig.set(null)
    window.history.replaceState({}, '', '/')
    syncCurrentUrl()
    setupRoute.go(undefined, true)
  })

  it('redirects /game to setup when there is no active session', async () => {
    window.history.replaceState({}, '', '/game')
    syncCurrentUrl()

    render(<App />)
    syncCurrentUrl()

    await waitFor(() => {
      expect(window.location.pathname).toBe('/')
    })
    await screen.findByRole('button', { name: 'Start Match' }, { timeout: 5000 })
  })
})
