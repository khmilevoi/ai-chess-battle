import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultSideConfig } from '@/actors/registry'
import { setupTestVault } from '@/test/credentialVault'
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
    expect(screen.getAllByLabelText('API key')).toSatisfy((inputs) =>
      inputs.every(
        (input: Element) => input instanceof HTMLInputElement && input.disabled,
      ),
    )
    expect(
      screen.getAllByText('Create the vault to save this API key.').length,
    ).toBe(2)
    expect(screen.getAllByRole('button', { name: 'Set up vault' }).length).toBe(2)
    expect(screen.getByRole('button', { name: 'Start Match' })).toBeDisabled()
  })

  it('updates Anthropic effort options based on the selected model capabilities', async () => {
    const user = userEvent.setup()
    const model = createMatchSetupModel({
      name: `match-setup-page-anthropic-${crypto.randomUUID()}`,
      initialConfig: {
        white: createDefaultSideConfig('anthropic'),
        black: createDefaultSideConfig('human'),
      },
      goToGame: vi.fn(),
      goToGames: vi.fn(),
    })

    render(<MatchSetupPage model={model} />)

    const modelSelect = screen.getAllByLabelText('Model')[0] as HTMLSelectElement
    const sonnetEffortSelect = screen.getByLabelText('Effort') as HTMLSelectElement

    expect(sonnetEffortSelect.value).toBe('medium')
    expect(
      within(sonnetEffortSelect).queryByRole('option', { name: 'X-High' }),
    ).not.toBeInTheDocument()

    await user.selectOptions(modelSelect, 'claude-opus-4-7')

    const opusEffortSelect = screen.getByLabelText('Effort') as HTMLSelectElement
    expect(within(opusEffortSelect).getByRole('option', { name: 'X-High' })).toBeInTheDocument()

    await user.selectOptions(opusEffortSelect, 'xhigh')
    expect((screen.getByLabelText('Effort') as HTMLSelectElement).value).toBe('xhigh')

    await user.selectOptions(modelSelect, 'claude-sonnet-4-6')

    const resetEffortSelect = screen.getByLabelText('Effort') as HTMLSelectElement
    expect(resetEffortSelect.value).toBe('medium')
    expect(
      within(resetEffortSelect).queryByRole('option', { name: 'X-High' }),
    ).not.toBeInTheDocument()

    await user.selectOptions(modelSelect, 'claude-haiku-4-5')

    expect(screen.queryByLabelText('Effort')).not.toBeInTheDocument()
  })

  it('renders an arbiter card with None and provider-backed settings', async () => {
    await setupTestVault({
      openai: 'sk-arbiter',
    })

    const user = userEvent.setup()
    const model = createMatchSetupModel({
      name: `match-setup-page-arbiter-${crypto.randomUUID()}`,
      initialConfig: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
        arbiter: null,
      },
      goToGame: vi.fn(),
      goToGames: vi.fn(),
    })

    render(<MatchSetupPage model={model} />)

    expect(screen.getByRole('heading', { name: 'Arbiter' })).toBeInTheDocument()

    const providerSelect = screen.getByLabelText('Provider') as HTMLSelectElement
    expect(within(providerSelect).getByRole('option', { name: 'None' })).toBeInTheDocument()

    await user.selectOptions(providerSelect, 'openai')

    expect(screen.getAllByText('API key').length).toBe(1)
    expect(screen.getAllByText('Model').length).toBeGreaterThan(0)
  })
})
