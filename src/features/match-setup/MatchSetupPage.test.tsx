import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultSideConfig } from '@/actors/registry'
import { resetVault } from '@/shared/storage/credentialVault'
import { MatchSetupPage } from './MatchSetupPage'
import { createMatchSetupModel } from './model'

describe('MatchSetupPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetVault()
  })

  it('renders new actor options and minimal provider settings', () => {
    const model = createMatchSetupModel({
      name: `match-setup-page-${crypto.randomUUID()}`,
      initialConfig: {
        white: createDefaultSideConfig('anthropic'),
        black: createDefaultSideConfig('google'),
      },
      goToGame: vi.fn(),
      goToGames: vi.fn(),
    })

    render(<MatchSetupPage model={model} />)

    expect(screen.getAllByRole('option', { name: 'Anthropic Actor' }).length).toBe(2)
    expect(screen.getAllByRole('option', { name: 'Gemini Actor' }).length).toBe(2)
    expect(screen.getAllByText('API key').length).toBe(2)
    expect(screen.getAllByText('Model').length).toBe(2)
    expect(screen.getByText('Configuration error for white / anthropic.')).toBeInTheDocument()
    expect(screen.getByText('Configuration error for black / google.')).toBeInTheDocument()
    expect(screen.getAllByText('API key is required').length).toBe(2)
    expect(screen.getByRole('button', { name: 'Start Match' })).toBeDisabled()
  })
})
