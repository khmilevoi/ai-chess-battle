import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { peek, urlAtom } from '@reatom/core'
import { DEFAULT_ANTHROPIC_MODEL } from '@/actors/ai-actor/anthropic'
import { DEFAULT_GOOGLE_MODEL } from '@/actors/ai-actor/google'
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_REASONING_EFFORT,
} from '@/actors/ai-actor/open-ai'
import { createDefaultSideConfig } from '@/actors/registry'
import {
  clearStoredGameArchive,
  createStoredGame,
  setActiveGameId,
  storedGameRecordAtom,
} from '@/shared/storage/gameSessionStorage'
import { storedMatchConfig } from '@/shared/storage/matchConfigStorage'
import { clearStoredActorConfigMap } from '@/shared/storage/actorConfigStorage'
import { lockVault, resetVault } from '@/shared/storage/credentialVault'
import { setupTestVault, TEST_MASTER_PASSWORD } from '@/test/credentialVault'
import { gameRoute, setupRoute } from './routes'
import { App } from './App'

function syncCurrentUrl() {
  urlAtom.syncFromSource(new URL(window.location.href), true)
}

function createRequiredStoredGame(
  ...args: Parameters<typeof createStoredGame>
) {
  const game = createStoredGame(...args)

  if (game instanceof Error) {
    throw game
  }

  return game
}

function createOpenAiSide() {
  return {
    actorKey: 'openai' as const,
    actorConfig: {
      apiKey: 'sk-test',
      model: DEFAULT_OPENAI_MODEL,
      reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
    },
  }
}

function createAnthropicSide() {
  return {
    actorKey: 'anthropic' as const,
    actorConfig: {
      apiKey: 'anthropic-test',
      model: DEFAULT_ANTHROPIC_MODEL,
    },
  }
}

function createGoogleSide() {
  return {
    actorKey: 'google' as const,
    actorConfig: {
      apiKey: 'google-test',
      model: DEFAULT_GOOGLE_MODEL,
    },
  }
}

function createOpenAiResponse(uci: string) {
  return new Response(
    JSON.stringify({
      output_text: JSON.stringify({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.slice(4) || 'null',
      }),
      output: [],
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  )
}

async function expectLiveMatchLoaded(expectedMoves: Array<string> = []) {
  await screen.findByRole('heading', { name: 'Live Match' }, { timeout: 5000 })
  expect(screen.queryByText('Loading match...')).not.toBeInTheDocument()

  for (const move of expectedMoves) {
    expect(screen.getByText(move)).toBeInTheDocument()
  }
}

describe('App integration', () => {
  beforeEach(async () => {
    clearStoredActorConfigMap()
    storedMatchConfig.clear()
    clearStoredGameArchive()
    window.localStorage.clear()
    resetVault()
    window.history.replaceState({}, '', '/')
    syncCurrentUrl()
    setupRoute.go(undefined, true)
    await setupTestVault()
  })

  afterEach(() => {
    cleanup()
    window.history.replaceState({}, '', '/__test_cleanup__')
    syncCurrentUrl()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('opens the vault setup dialog from the header and closes it after setup', async () => {
    const user = userEvent.setup()
    resetVault()
    window.localStorage.clear()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start Match' })).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'AI Chess Battle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Setup' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Games' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No vault configured' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Set up vault' }))

    const dialog = await screen.findByRole(
      'dialog',
      { name: 'Set up credential vault' },
      { timeout: 5000 },
    )

    await user.type(within(dialog).getByLabelText('Master password'), TEST_MASTER_PASSWORD)
    await user.type(
      within(dialog).getByLabelText('Confirm password'),
      TEST_MASTER_PASSWORD,
    )
    await user.click(within(dialog).getByRole('button', { name: 'Set up vault' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    expect(screen.getByRole('heading', { name: 'Vault unlocked' })).toBeInTheDocument()
    expect(screen.getByText('Credential vault is ready in this tab.')).toBeInTheDocument()
  }, 15000)

  it('disables provider API key inputs until the vault is unlocked from provider settings', async () => {
    const user = userEvent.setup()

    render(<App />)

    await screen.findByRole('button', { name: 'Start Match' }, { timeout: 5000 })
    const actorSelects = screen.getAllByLabelText('Actor')
    await user.selectOptions(actorSelects[0]!, 'openai')
    await user.selectOptions(actorSelects[1]!, 'anthropic')

    await user.click(screen.getByRole('button', { name: 'Manage vault' }))
    await user.click(
      await screen.findByRole('button', { name: 'Lock vault' }, { timeout: 5000 }),
    )

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    const apiKeyInputs = screen.getAllByLabelText('API key')
    expect(apiKeyInputs).toHaveLength(2)
    expect(apiKeyInputs).toSatisfy((inputs) =>
      inputs.every(
        (input: Element) => input instanceof HTMLInputElement && input.disabled,
      ),
    )
    expect(
      screen.getAllByText('Unlock the vault to edit this API key.').length,
    ).toBe(2)

    const providerHint = screen.getAllByText('Unlock the vault to edit this API key.')[0]
    const providerActions = providerHint.closest('div')

    if (!providerActions) {
      throw new Error('Expected the provider hint to be wrapped with an action container.')
    }

    await user.click(within(providerActions).getByRole('button', { name: 'Unlock vault' }))

    const unlockDialog = await screen.findByRole(
      'dialog',
      { name: 'Unlock credential vault' },
      { timeout: 5000 },
    )

    await user.type(
      within(unlockDialog).getByLabelText('Master password'),
      TEST_MASTER_PASSWORD,
    )
    await user.click(within(unlockDialog).getByRole('button', { name: 'Unlock vault' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    expect(
      screen
        .getAllByLabelText('API key')
        .every((input: Element) => !input.hasAttribute('disabled')),
    ).toBe(true)
  }, 15000)

  it('keeps the reset flow inside the modal after clearing the vault', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<App />)

    await screen.findByRole('button', { name: 'Manage vault' }, { timeout: 5000 })
    await user.click(screen.getByRole('button', { name: 'Manage vault' }))
    await user.click(
      await screen.findByRole('button', { name: 'Reset vault' }, { timeout: 5000 }),
    )

    expect(confirmSpy).toHaveBeenCalledWith(
      'Reset the encrypted vault? Stored API keys will be removed and must be entered again.',
    )
    expect(
      await screen.findByRole('dialog', { name: 'Set up credential vault' }, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No vault configured' })).toBeInTheDocument()
    expect(screen.getByText('Credential vault reset.')).toBeInTheDocument()
  })

  it('shows unlock errors inside the dialog and keeps the vault locked', async () => {
    const user = userEvent.setup()

    lockVault()
    render(<App />)

    await screen.findByRole('button', { name: 'Unlock vault' }, { timeout: 5000 })
    await user.click(screen.getByRole('button', { name: 'Unlock vault' }))

    const dialog = await screen.findByRole(
      'dialog',
      { name: 'Unlock credential vault' },
      { timeout: 5000 },
    )

    await user.type(within(dialog).getByLabelText('Master password'), 'wrong-password')
    await user.click(within(dialog).getByRole('button', { name: 'Unlock vault' }))

    expect(await screen.findByRole('dialog', { name: 'Unlock credential vault' })).toBe(dialog)
    expect(screen.getByRole('heading', { name: 'Vault locked' })).toBeInTheDocument()
    expect(
      await within(dialog).findByText(
        'Saved configuration could not be loaded. Defaults were restored.',
      ),
    ).toBeInTheDocument()
  })

  it('starts a match, navigates through header tabs, and keeps the game resumable', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('button', { name: 'Start Match' })
    await user.click(screen.getByRole('button', { name: 'Start Match' }))

    await screen.findByRole('heading', { name: 'Live Match' }, { timeout: 5000 })
    expect(window.location.pathname).toMatch(/^\/game\/.+$/)
    expect(screen.getByRole('button', { name: 'Active game' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back to setup' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Setup' }))

    await screen.findByRole('button', { name: 'Start Match' }, { timeout: 5000 })
    expect(screen.getByText('Resume your last game')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resume Match' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Active game' }))

    await screen.findByRole('heading', { name: 'Live Match' }, { timeout: 5000 })
  }, 15000)

  it('opens the saved games page and navigates to a selected game', async () => {
    const user = userEvent.setup()
    const savedGame = createRequiredStoredGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      moves: ['e2e4', 'e7e5'],
    })
    setActiveGameId(savedGame.id)

    render(<App />)

    await screen.findByRole('button', { name: 'Games' }, { timeout: 5000 })
    await user.click(screen.getByRole('button', { name: 'Games' }))

    await screen.findByRole('heading', { name: 'Saved games' }, { timeout: 5000 })
    const openGameButtons = await screen.findAllByRole(
      'button',
      { name: 'Open game' },
      { timeout: 5000 },
    )

    await user.click(openGameButtons[0]!)

    await screen.findByRole('heading', { name: 'Live Match' }, { timeout: 5000 })
    expect(window.location.pathname).toBe(`/game/${savedGame.id}`)
  })

  it('shows a resume card when an active unfinished game exists', async () => {
    const game = createRequiredStoredGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      moves: ['e2e4', 'e7e5'],
    })
    setActiveGameId(game.id)

    render(<App />)

    await screen.findByText('Resume your last game', undefined, { timeout: 5000 })
    expect(screen.getByText('Resume your last game')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Active game' })).toBeInTheDocument()
  })

  it('restores a saved session on cold /game/:gameId load', async () => {
    const game = createRequiredStoredGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      moves: ['e2e4', 'e7e5'],
    })
    setActiveGameId(game.id)
    window.history.replaceState({}, '', `/game/${game.id}`)
    syncCurrentUrl()

    render(<App />)

    await expectLiveMatchLoaded(['e2e4', 'e7e5'])
  })

  it('restores a saved Anthropic session on cold /game/:gameId load', async () => {
    const game = createRequiredStoredGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createAnthropicSide(),
      },
    })
    setActiveGameId(game.id)
    window.history.replaceState({}, '', `/game/${game.id}`)
    syncCurrentUrl()

    render(<App />)

    await expectLiveMatchLoaded()
    expect(screen.getAllByText('Anthropic Actor').length).toBeGreaterThan(0)
  })

  it('restores a saved Gemini session on cold /game/:gameId load', async () => {
    const game = createRequiredStoredGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createGoogleSide(),
      },
    })
    setActiveGameId(game.id)
    window.history.replaceState({}, '', `/game/${game.id}`)
    syncCurrentUrl()

    render(<App />)

    await expectLiveMatchLoaded()
    expect(screen.getAllByText('Gemini Actor').length).toBeGreaterThan(0)
  })

  it('keeps the same game-route model while persisting confirmation controls on the live page', async () => {
    const user = userEvent.setup()
    const pendingResponses: Array<(response: Response) => void> = []
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          pendingResponses.push(resolve)
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const game = createRequiredStoredGame({
      config: {
        white: createOpenAiSide(),
        black: createDefaultSideConfig('human'),
      },
      actorControls: {
        openai: {
          waitForConfirmation: true,
        },
      },
    })
    setActiveGameId(game.id)
    window.history.replaceState({}, '', `/game/${game.id}`)
    syncCurrentUrl()

    render(<App />)

    await expectLiveMatchLoaded()
    await waitFor(() => {
      expect(gameRoute.loader.data()).not.toBeNull()
    })

    const initialModel = gameRoute.loader.data()

    if (initialModel === null) {
      throw new Error('Expected the game route loader to expose a live model.')
    }

    const checkbox = screen.getByRole('checkbox', {
      name: /Wait for confirmation before sending the OpenAI request/i,
    })

    expect(checkbox).toBeChecked()
    expect(screen.getByText('White is waiting for your approval.')).toBeInTheDocument()

    await user.click(checkbox)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    expect(pendingResponses).toHaveLength(1)
    expect(gameRoute.loader.data()).toBe(initialModel)
    expect(
      screen.getByRole('checkbox', {
        name: /Wait for confirmation before sending the OpenAI request/i,
      }),
    ).not.toBeChecked()
    expect(peek(storedGameRecordAtom(game.id))?.actorControls).toEqual({
      openai: {
        waitForConfirmation: false,
      },
    })

    pendingResponses[0]?.(createOpenAiResponse('e2e4'))

    await expectLiveMatchLoaded(['e2e4'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(gameRoute.loader.data()).toBe(initialModel)
  })

  it('hydrates persisted Gemini confirmation controls on cold route load', async () => {
    const user = userEvent.setup()
    const game = createRequiredStoredGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: createGoogleSide(),
      },
      actorControls: {
        google: {
          waitForConfirmation: true,
        },
      },
    })
    setActiveGameId(game.id)
    window.history.replaceState({}, '', `/game/${game.id}`)
    syncCurrentUrl()

    render(<App />)

    await expectLiveMatchLoaded()
    const checkbox = screen.getByRole('checkbox', {
      name: /Wait for confirmation before sending the Gemini request/i,
    })

    expect(checkbox).toBeChecked()

    await user.click(checkbox)

    await waitFor(() => {
      expect(peek(storedGameRecordAtom(game.id))?.actorControls).toEqual({
        google: {
          waitForConfirmation: false,
        },
      })
    })
  })

  it('keeps the game route responsive across repeated setup, active-game, and archive transitions', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('button', { name: 'Start Match' })
    await user.click(screen.getByRole('button', { name: 'Start Match' }))
    await expectLiveMatchLoaded()

    for (let iteration = 0; iteration < 3; iteration += 1) {
      await user.click(screen.getByRole('button', { name: 'Setup' }))
      await screen.findByRole('button', { name: 'Start Match' }, { timeout: 5000 })
      expect(screen.getByText('Resume your last game')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Active game' }))
      await expectLiveMatchLoaded()

      await user.click(screen.getByRole('button', { name: 'Games' }))
      await screen.findByRole('heading', { name: 'Saved games' }, { timeout: 5000 })

      const openGameButtons = await screen.findAllByRole(
        'button',
        { name: 'Open game' },
        { timeout: 5000 },
      )

      await user.click(openGameButtons[0]!)
      await expectLiveMatchLoaded()
    }
  }, 15000)

  it('keeps repeated visits to the same saved game responsive after a cold route load', async () => {
    const user = userEvent.setup()
    const openAiSide = createDefaultSideConfig('openai')
    const game = createRequiredStoredGame({
      config: {
        white: createDefaultSideConfig('human'),
        black: {
          ...openAiSide,
          actorConfig: {
            ...openAiSide.actorConfig,
            apiKey: 'sk-test',
          },
        },
      },
      moves: ['e2e4', 'e7e5'],
    })
    window.history.replaceState({}, '', `/game/${game.id}`)
    syncCurrentUrl()

    render(<App />)

    for (let iteration = 0; iteration < 4; iteration += 1) {
      await expectLiveMatchLoaded(['e2e4', 'e7e5'])

      await user.click(screen.getByRole('button', { name: 'Games' }))
      await screen.findByRole('heading', { name: 'Saved games' }, { timeout: 5000 })

      const openGameButtons = await screen.findAllByRole(
        'button',
        { name: 'Open game' },
        { timeout: 5000 },
      )

      await user.click(openGameButtons[0]!)
    }

    await expectLiveMatchLoaded(['e2e4', 'e7e5'])
  }, 15000)
})
