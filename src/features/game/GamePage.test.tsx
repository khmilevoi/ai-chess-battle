import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_GOOGLE_MODEL } from '@/actors/ai-actor/google'
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_REASONING_EFFORT,
} from '@/actors/ai-actor/open-ai'
import { DEFAULT_ARBITER_PERSONALITY_KEY } from '@/arbiter/personalities'
import { createDefaultSideConfig } from '@/actors/registry'
import type { MatchConfig } from '@/actors/registry'
import * as openAiProvider from '@/shared/ai-providers/openai'
import {
  clearStoredGameArchive,
  createStoredGame,
  setActiveGameId,
  type StoredGameRecord,
  type StoredGameActorControls,
} from '@/shared/storage/gameSessionStorage'
import { setupTestVault } from '@/test/credentialVault'
import styles from './GamePage.module.css'
import { GamePage } from './GamePage'
import { createGameModel } from './model'

function createRequiredStoredGame(
  ...args: Parameters<typeof createStoredGame>
) {
  const game = createStoredGame(...args)

  if (game instanceof Error) {
    throw game
  }

  return game
}

function createSavedGame({
  config,
  actorControls = {},
  moves = [],
  evaluations,
}: {
  config: MatchConfig
  actorControls?: StoredGameActorControls
  moves?: Array<string>
  evaluations?: StoredGameRecord['evaluations']
}) {
  const game = createRequiredStoredGame({ config, actorControls, moves, evaluations })
  setActiveGameId(game.id)
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

function createGoogleSide() {
  return {
    actorKey: 'google' as const,
    actorConfig: {
      apiKey: 'google-test',
      model: DEFAULT_GOOGLE_MODEL,
    },
  }
}

async function createStartedModel({
  config,
  actorControls = {},
  moves = [],
  evaluations,
}: {
  config: MatchConfig
  actorControls?: StoredGameActorControls
  moves?: Array<string>
  evaluations?: StoredGameRecord['evaluations']
}) {
  const game = createSavedGame({ config, actorControls, moves, evaluations })
  const model = createGameModel({
    name: `game-page-test-${crypto.randomUUID()}`,
    gameId: game.id,
    leaveToSetup: vi.fn(),
    leaveToGames: vi.fn(),
  })

  expect(await model.startMatch()).toBeNull()

  return model
}

describe('GamePage', () => {
  const longMoveHistory = [
    'e2e4',
    'e7e5',
    'f2f4',
    'g7g5',
    'h2h4',
    'f7f5',
    'g2g4',
    'd7d5',
    'd2d4',
    'c7c5',
    'c2c4',
  ]

  beforeEach(async () => {
    openAiProvider.resetOpenAiSdkCache()
    clearStoredGameArchive()
    window.localStorage.clear()
    await setupTestVault()
  })

  it('renders the combined actor card and removes the position panel', async () => {
    const model = await createStartedModel({
      config: {
        white: createOpenAiSide(),
        black: createDefaultSideConfig('human'),
      },
      moves: ['e2e4'],
    })

    render(<GamePage model={model} />)

    expect(screen.getByRole('heading', { name: 'Actors' })).not.toBeNull()
    expect(screen.getAllByText('White').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Black').length).toBeGreaterThan(0)
    expect(screen.getByText('Confirm before OpenAI request')).not.toBeNull()
    expect(
      screen.getAllByText(/Move on the board when this side is active\./).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { name: 'Position' })).toBeNull()
  })

  it('renders read-only match info for both sides and hides API keys', async () => {
    const model = await createStartedModel({
      config: {
        white: createOpenAiSide(),
        black: createDefaultSideConfig('human'),
      },
    })

    render(<GamePage model={model} />)

    const matchInfoContent = screen
      .getByRole('heading', { name: 'Saved setup' })
      .closest('aside')

    if (!matchInfoContent) {
      throw new Error('Expected saved setup to be rendered in an aside panel.')
    }

    const panel = within(matchInfoContent)
    expect(panel.getByText('White')).not.toBeNull()
    expect(panel.getByText('Black')).not.toBeNull()
    expect(panel.getByText('GPT-5.4')).not.toBeNull()
    expect(panel.getByText('High')).not.toBeNull()
    expect(panel.getByText('Black moves are entered directly on the board.')).not.toBeNull()
    expect(panel.queryByText('sk-test')).toBeNull()
  })

  it('falls back to raw saved model values when they are outside the curated options', async () => {
    const model = await createStartedModel({
      config: {
        white: {
          actorKey: 'openai',
          actorConfig: {
            apiKey: 'sk-test',
            model: 'custom-openai-model',
            reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
          },
        },
        black: createDefaultSideConfig('human'),
      },
    })

    render(<GamePage model={model} />)

    const matchInfoContent = screen
      .getByRole('heading', { name: 'Saved setup' })
      .closest('aside')

    if (!matchInfoContent) {
      throw new Error('Expected saved setup to be rendered in an aside panel.')
    }

    expect(within(matchInfoContent).getByText('custom-openai-model')).not.toBeNull()
  })

  it('renders a shared OpenAI control card when both sides use the same actor type', async () => {
    const model = await createStartedModel({
      config: {
        white: createOpenAiSide(),
        black: createOpenAiSide(),
      },
      actorControls: {
        openai: {
          waitForConfirmation: true,
        },
      },
    })

    render(<GamePage model={model} />)

    expect(screen.getAllByText('White & Black').length).toBeGreaterThan(0)
    expect(screen.getByText('White is waiting.')).not.toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Send OpenAI request' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  it('renders a shared Gemini control card when both sides use the same actor type', async () => {
    const model = await createStartedModel({
      config: {
        white: createGoogleSide(),
        black: createGoogleSide(),
      },
      actorControls: {
        google: {
          waitForConfirmation: true,
        },
      },
    })

    render(<GamePage model={model} />)

    expect(screen.getAllByText('White & Black').length).toBeGreaterThan(0)
    expect(screen.getByText('White is waiting.')).not.toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Send Gemini request' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  it('shows an unavailable state for actor controls while reviewing history', async () => {
    const model = await createStartedModel({
      config: {
        white: createOpenAiSide(),
        black: createDefaultSideConfig('human'),
      },
      moves: ['e2e4'],
    })

    render(<GamePage model={model} />)
    model.goToMove(0)

    await waitFor(() => {
      expect(
        screen.getAllByText('Editing is disabled in history view. Return to the latest move.')
          .length,
      ).toBeGreaterThan(0)
    })
    expect(screen.queryByText('Confirm before OpenAI request')).toBeNull()
  })

  it('autoscrolls only the move list when a new move is added on the live tail', async () => {
    const scrollIntoViewSpy = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewSpy,
    })

    const model = await createStartedModel({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
    })

    const { container } = render(<GamePage model={model} />)
    const historyList = container.querySelector(`.${styles.historyList}`)

    expect(historyList).not.toBeNull()

    Object.defineProperty(historyList as HTMLElement, 'scrollHeight', {
      configurable: true,
      value: 400,
    })
    ;(historyList as HTMLElement).scrollTop = 0

    model.clickSquare('e2')
    model.clickSquare('e4')

    await waitFor(() => {
      expect((historyList as HTMLElement).scrollTop).toBe(400)
    })
    expect(scrollIntoViewSpy).not.toHaveBeenCalled()
  })

  it('does not autoscroll the move list while reviewing an older move', async () => {
    const scrollIntoViewSpy = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewSpy,
    })

    const model = await createStartedModel({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      moves: ['e2e4'],
    })

    const { container } = render(<GamePage model={model} />)
    const historyList = container.querySelector(`.${styles.historyList}`)

    expect(historyList).not.toBeNull()

    Object.defineProperty(historyList as HTMLElement, 'scrollHeight', {
      configurable: true,
      value: 240,
    })
    ;(historyList as HTMLElement).scrollTop = 37

    model.goToMove(0)

    await waitFor(() => {
      expect(model.historyCursor()).toBe(0)
    })
    expect((historyList as HTMLElement).scrollTop).toBe(37)
    expect(scrollIntoViewSpy).not.toHaveBeenCalled()
  })

  it('renders multi-digit move numbers and secondary move labels in long histories', async () => {
    const model = await createStartedModel({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      moves: longMoveHistory,
    })

    const { container } = render(<GamePage model={model} />)
    const moveNumbers = Array.from(
      container.querySelectorAll(`.${styles.historyMoveNumber}`),
    ).map((element) => element.textContent)

    expect(moveNumbers).toContain('10')
    expect(moveNumbers).toContain('11')
    expect(screen.getByRole('button', { name: '10c7 to c5c7c5' })).not.toBeNull()
    expect(screen.getByRole('button', { name: '11c2 to c4c2c4' })).not.toBeNull()
    expect(
      screen.getByText('c7c5', { selector: `.${styles.historyMoveSecondary}` }),
    ).not.toBeNull()
    expect(
      screen.getByText('c2c4', { selector: `.${styles.historyMoveSecondary}` }),
    ).not.toBeNull()
  })

  it('renders the eval bar only when an arbiter is configured and walks back through prior evaluations', async () => {
    const model = await createStartedModel({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
        arbiter: {
          arbiterKey: 'openai',
          arbiterConfig: {
            model: 'gpt-5-nano',
            personalityKey: DEFAULT_ARBITER_PERSONALITY_KEY,
          },
        },
      },
      moves: ['e2e4', 'e7e5', 'g1f3'],
      evaluations: [
        {
          score: 50,
          comment: 'White has the easier game.',
        },
        null,
        {
          score: -20,
          comment: 'Black has enough counterplay.',
        },
      ],
    })

    render(<GamePage model={model} />)

    expect(screen.getByLabelText('Evaluation bar')).not.toBeNull()
    expect(screen.getByText('-0.2')).not.toBeNull()

    model.goToMove(2)

    await waitFor(() => {
      expect(screen.getByText('+0.5')).not.toBeNull()
    })

    model.goToMove(0)

    await waitFor(() => {
      expect(screen.getByText('--')).not.toBeNull()
    })
  })

  it('keeps the eval bar hidden when the saved game has no arbiter', async () => {
    const model = await createStartedModel({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
      },
      moves: ['e2e4'],
    })

    const { container } = render(<GamePage model={model} />)
    const boardStack = container.querySelector<HTMLElement>(`.${styles.boardStack}`)

    expect(screen.queryByLabelText('Evaluation bar')).toBeNull()
    expect(boardStack?.querySelector('[role="status"]')).toBeNull()
  })

  it('keeps the arbiter ticker visible whenever an arbiter is configured', async () => {
    let resolveEvaluation: ((value: { score: number; comment: string }) => void) | null = null
    vi.spyOn(openAiProvider, 'callOpenAi').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEvaluation = resolve
        }),
    )

    const model = await createStartedModel({
      config: {
        white: createDefaultSideConfig('human'),
        black: createDefaultSideConfig('human'),
        arbiter: {
          arbiterKey: 'openai',
          arbiterConfig: {
            model: 'gpt-5-nano',
            personalityKey: DEFAULT_ARBITER_PERSONALITY_KEY,
          },
        },
      },
    })

    const { container } = render(<GamePage model={model} />)
    const boardStack = container.querySelector<HTMLElement>(`.${styles.boardStack}`)
    const boardPanel = container.querySelector<HTMLElement>(`.${styles.boardPanel}`)

    if (!(boardStack instanceof HTMLElement) || !(boardPanel instanceof HTMLElement)) {
      throw new Error('Expected the board stack and board panel to render.')
    }

    const initialTicker = within(boardStack).getByRole('status')
    expect(initialTicker.textContent).toContain('Arbiter online. Awaiting the next move.')
    expect(boardStack.firstElementChild).toBe(initialTicker)
    expect(initialTicker.nextElementSibling).toBe(boardPanel)

    model.clickSquare('e2')
    model.clickSquare('e4')

    await waitFor(() => {
      expect(resolveEvaluation).not.toBeNull()
    })
    expect(within(boardStack).getByRole('status')).toHaveAttribute(
      'aria-label',
      'Arbiter evaluation ticker (evaluating now)',
    )

    const completeEvaluation: (value: { score: number; comment: string }) => void =
      resolveEvaluation ??
      (() => {
        throw new Error('Expected arbiter evaluation to be queued.')
      })

    completeEvaluation({
      score: 32,
      comment: 'White opens with purpose.',
    })

    await waitFor(() => {
      const ticker = within(boardStack).getByRole('status')
      expect(ticker.textContent).toContain('White opens with purpose.')
      expect(ticker).toHaveAttribute('aria-label', 'Arbiter evaluation ticker')
      expect(boardStack.firstElementChild).toBe(ticker)
      expect(ticker.nextElementSibling).toBe(boardPanel)
    })

    model.goToMove(0)

    await waitFor(() => {
      const ticker = within(boardStack).getByRole('status')
      expect(ticker.textContent).toContain('Arbiter online. Awaiting the next move.')
      expect(boardStack.firstElementChild).toBe(ticker)
      expect(ticker.nextElementSibling).toBe(boardPanel)
    })

    model.goToMove(1)

    await waitFor(() => {
      const ticker = within(boardStack).getByRole('status')
      expect(ticker.textContent).toContain('White opens with purpose.')
      expect(boardStack.firstElementChild).toBe(ticker)
      expect(ticker.nextElementSibling).toBe(boardPanel)
    })
  })
})
