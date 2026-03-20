import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { matchSessionConfig } from './model'
import { setupRoute } from './routes'
import { App } from './App'

describe('App integration', () => {
  beforeEach(() => {
    window.localStorage.clear()
    matchSessionConfig.set(null)
    setupRoute.go(undefined, true)
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

    await user.click(screen.getByRole('button', { name: 'Start Match' }))

    await waitFor(() => {
      expect(screen.getByText('Live Match')).toBeInTheDocument()
    })
    expect(screen.getByText('No moves yet.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to setup' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start Match' })).toBeInTheDocument()
    })
  })

  it('redirects /game to setup when there is no active session', async () => {
    window.history.replaceState({}, '', '/game')

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start Match' })).toBeInTheDocument()
    })
    expect(window.location.pathname).toBe('/')
  })
})
