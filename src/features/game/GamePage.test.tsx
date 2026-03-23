import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_GOOGLE_MODEL } from '@/actors/ai-actor/google'
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_REASONING_EFFORT,
} from '@/actors/ai-actor/open-ai'
import { createDefaultSideConfig } from '@/actors/registry'
import type { MatchConfig } from '@/actors/registry'
import {
  clearStoredGameArchive,
  createStoredGame,
  setActiveGameId,
  type StoredGameActorControls,
} from '@/shared/storage/gameSessionStorage'
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
}: {
  config: MatchConfig
  actorControls?: StoredGameActorControls
  moves?: Array<string>
}) {
  const game = createRequiredStoredGame({ config, actorControls, moves })
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
}: {
  config: MatchConfig
  actorControls?: StoredGameActorControls
  moves?: Array<string>
}) {
  const game = createSavedGame({ config, actorControls, moves })
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

  beforeEach(() => {
    clearStoredGameArchive()
    window.localStorage.clear()
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

    expect(screen.getByRole('heading', { name: 'Actors' })).toBeInTheDocument()
    expect(screen.getAllByText('White').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Black').length).toBeGreaterThan(0)
    expect(
      screen.getByText('Wait for confirmation before sending the OpenAI request'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Moves are selected directly on the board\./)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Position' })).not.toBeInTheDocument()
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

    expect(screen.getByText('White & Black request controls')).toBeInTheDocument()
    expect(screen.getByText('White is waiting for your approval.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send OpenAI request' })).toBeEnabled()
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

    expect(screen.getByText('White & Black request controls')).toBeInTheDocument()
    expect(screen.getByText('White is waiting for your approval.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send Gemini request' })).toBeEnabled()
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
    expect(
      screen.queryByText('Wait for confirmation before sending the OpenAI request'),
    ).not.toBeInTheDocument()
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
    expect(
      screen.getByRole('button', { name: '10c7 to c5c7c5' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '11c2 to c4c2c4' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('c7c5', { selector: `.${styles.historyMoveSecondary}` }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('c2c4', { selector: `.${styles.historyMoveSecondary}` }),
    ).toBeInTheDocument()
  })
})
