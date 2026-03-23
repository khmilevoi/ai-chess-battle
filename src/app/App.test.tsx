import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { urlAtom } from '@reatom/core'
import { createDefaultSideConfig } from '../actors/registry'
import {
  clearStoredGameSession,
  createStoredGameSession,
  saveStoredGameSession,
} from '../shared/storage/gameSessionStorage'
import { storedMatchConfig } from '../shared/storage/matchConfigStorage'
import { clearStoredActorConfigMap } from '../shared/storage/actorConfigStorage'
import { matchSessionConfig } from './model'
import { setupRoute } from './routes'
import { App } from './App'

function syncCurrentUrl() {
  urlAtom.syncFromSource(new URL(window.location.href), true)
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

function createAbortablePendingResponse(signal: AbortSignal | undefined) {
  return new Promise<Response>((_, reject) => {
    if (!signal) {
      return
    }

    signal.addEventListener(
      'abort',
      () => {
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

describe('App integration', () => {
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

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders the setup route on root path', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start Match' })).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'AI Chess Battle' })).toBeInTheDocument()
  })

  it('switches actor settings and blocks invalid setup', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('button', { name: 'Start Match' })
    const actorSelects = screen.getAllByLabelText('Actor')
    const startButton = screen.getByRole('button', { name: 'Start Match' })

    expect(startButton).toBeEnabled()

    await user.selectOptions(actorSelects[0]!, 'openai')

    expect(screen.getByLabelText('API key')).toBeInTheDocument()
    expect(startButton).toBeDisabled()

    await user.type(screen.getByLabelText('API key'), 'sk-test')

    await waitFor(() => {
      expect(startButton).toBeEnabled()
    })
  })

  it('starts a match and navigates to the game screen', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('button', { name: 'Start Match' })
    await user.click(screen.getByRole('button', { name: 'Start Match' }))

    await screen.findByRole('heading', { name: 'Live Match' }, { timeout: 5000 })
    expect(screen.getByText('No moves yet.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to setup' }))

    await screen.findByRole('button', { name: 'Start Match' }, { timeout: 5000 })
  })

  it('hides actor controls when the active actor has no runtime controls', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('button', { name: 'Start Match' })
    await user.click(screen.getByRole('button', { name: 'Start Match' }))

    await screen.findByRole('heading', { name: 'Live Match' }, { timeout: 5000 })
    expect(
      screen.queryByRole('heading', { name: 'Actor controls' }),
    ).not.toBeInTheDocument()
  })

  it('starts and sustains an OpenAI versus OpenAI match', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()

    vi.stubGlobal('fetch', fetchMock)

    fetchMock
      .mockResolvedValueOnce(createOpenAiResponse('e2e4'))
      .mockResolvedValueOnce(createOpenAiResponse('e7e5'))
      .mockImplementationOnce((input, init) =>
        createAbortablePendingResponse(
          input instanceof Request ? input.signal : init?.signal,
        ),
      )

    render(<App />)

    await screen.findByRole('button', { name: 'Start Match' })
    const actorSelects = screen.getAllByLabelText('Actor')

    await user.selectOptions(actorSelects[0]!, 'openai')
    await user.selectOptions(actorSelects[1]!, 'openai')
    await user.type(screen.getAllByLabelText('API key')[0]!, 'sk-test')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start Match' })).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: 'Start Match' }))

    await screen.findByRole('heading', { name: 'Live Match' }, { timeout: 5000 })
    expect(screen.getByRole('heading', { name: 'Actor controls' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Send OpenAI request' }),
    ).toBeDisabled()
    await waitFor(
      () => {
        expect(
          screen.getByText((content) => content.includes('e2e4') && content.includes('e7e5')),
        ).toBeInTheDocument()
      },
      { timeout: 5000 },
    )

    expect(window.location.pathname).toBe('/game')
    expect(fetchMock).toHaveBeenCalledTimes(3)

    await user.click(screen.getByRole('button', { name: 'Back to setup' }))
    await screen.findByRole('button', { name: 'Start Match' }, { timeout: 5000 })
  })

  it('waits for confirmation before sending an OpenAI request when confirmation is enabled', async () => {
    const user = userEvent.setup()
    let resolveFirstMove: ((response: Response) => void) | null = null
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirstMove = resolve
          }),
      )
      .mockResolvedValueOnce(createOpenAiResponse('e7e5'))
      .mockImplementationOnce((input, init) =>
        createAbortablePendingResponse(
          input instanceof Request ? input.signal : init?.signal,
        ),
      )

    render(<App />)

    await screen.findByRole('button', { name: 'Start Match' })
    const actorSelects = screen.getAllByLabelText('Actor')

    await user.selectOptions(actorSelects[0]!, 'openai')
    await user.selectOptions(actorSelects[1]!, 'openai')
    await user.type(screen.getAllByLabelText('API key')[0]!, 'sk-test')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start Match' })).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: 'Start Match' }))

    await screen.findByRole('heading', { name: 'Live Match' }, { timeout: 5000 })
    await screen.findByRole('heading', { name: 'Actor controls' }, { timeout: 5000 })

    const confirmationToggle = screen.getByRole('checkbox', {
      name: 'Wait for confirmation before sending the OpenAI request',
    })

    expect(confirmationToggle).not.toBeChecked()
    expect(
      screen.getByRole('button', { name: 'Send OpenAI request' }),
    ).toBeDisabled()

    await user.click(confirmationToggle)
    await act(async () => {
      ;(resolveFirstMove as null | ((response: Response) => void))?.(
        createOpenAiResponse('e2e4'),
      )
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    await waitFor(() => {
      expect(screen.getByText('White request controls')).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(
      screen.getByRole('button', { name: 'Send OpenAI request' }),
    ).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Send OpenAI request' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })
  })

  it('shows a resume card when an active session exists', async () => {
    const sessionConfig = {
      white: createDefaultSideConfig('human'),
      black: createDefaultSideConfig('human'),
    }

    saveStoredGameSession(
      createStoredGameSession({
        config: sessionConfig,
        moves: ['e2e4', 'e7e5'],
      }),
    )
    matchSessionConfig.set(sessionConfig)

    render(<App />)

    await screen.findByRole('button', { name: 'Resume Match' }, { timeout: 5000 })
    expect(screen.getByText('Resume your last game')).toBeInTheDocument()
  })

  it('restores an active session on cold /game load', async () => {
    const sessionConfig = {
      white: createDefaultSideConfig('human'),
      black: createDefaultSideConfig('human'),
    }

    saveStoredGameSession(
      createStoredGameSession({
        config: sessionConfig,
        moves: ['e2e4', 'e7e5'],
      }),
    )
    matchSessionConfig.set(sessionConfig)
    window.history.replaceState({}, '', '/game')
    syncCurrentUrl()

    render(<App />)

    await screen.findByRole('heading', { name: 'Live Match' }, { timeout: 5000 })
    expect(
      screen.getByText((content) => content.includes('e2e4') && content.includes('e7e5')),
    ).toBeInTheDocument()
  })
})
