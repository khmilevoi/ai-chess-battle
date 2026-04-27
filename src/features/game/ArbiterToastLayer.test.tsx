import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import styles from './ArbiterToastLayer.module.css'
import { ArbiterToastLayer } from './ArbiterToastLayer'

const IDLE_TICKER_TEXT = 'Arbiter online. Awaiting the next move.'

function createResolvedEvaluation(
  overrides: Partial<{
    score: number
    comment: string
    moveIndex: number
  }> = {},
) {
  return {
    evaluation: {
      score: overrides.score ?? 32,
      comment: overrides.comment ?? 'White opens with purpose.',
    },
    moveIndex: overrides.moveIndex ?? 0,
  }
}

function stubMatchMedia(matches = false) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const mediaQueryList = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn(
      (_eventName: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener)
      },
    ),
    removeEventListener: vi.fn(
      (_eventName: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener)
      },
    ),
    addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener)
    }),
    removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener)
    }),
    dispatchEvent: vi.fn(),
  }

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(() => mediaQueryList),
  })

  return mediaQueryList
}

describe('ArbiterToastLayer', () => {
  beforeEach(() => {
    stubMatchMedia(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a persistent placeholder ticker when no comment is available yet', () => {
    const { container } = render(
      <ArbiterToastLayer evaluation={null} evaluating={false} />,
    )
    const status = screen.getByRole('status')
    const duplicateText = container.querySelector('[aria-hidden="true"]')

    expect(status.textContent).toContain('Arbiter')
    expect(screen.getAllByText(IDLE_TICKER_TEXT)).toHaveLength(2)
    expect(container.querySelector(`.${styles.track}`)).not.toBeNull()
    expect(container.querySelector(`.${styles.idle}`)).not.toBeNull()
    expect(container.querySelector(`.${styles.statusDot}`)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Dismiss arbiter comment' })).toBeNull()
    expect(duplicateText?.textContent).toBe(IDLE_TICKER_TEXT)
  })

  it('renders the resolved evaluation in the ticker and remounts the track for a new move index', () => {
    const { container, rerender } = render(
      <ArbiterToastLayer
        evaluation={createResolvedEvaluation({
          moveIndex: 0,
          comment: 'White opens with purpose.',
        })}
        evaluating={false}
      />,
    )

    const firstTrack = container.querySelector(`.${styles.track}`)

    expect(screen.getAllByText('White opens with purpose.')).toHaveLength(2)
    expect(container.querySelector(`.${styles.whiteMove}`)).not.toBeNull()
    expect(container.querySelector(`.${styles.statusDot}`)).toBeNull()

    rerender(
      <ArbiterToastLayer
        evaluation={createResolvedEvaluation({
          moveIndex: 1,
          comment: 'Black hits the center in reply.',
        })}
        evaluating={false}
      />,
    )

    const secondTrack = container.querySelector(`.${styles.track}`)

    expect(screen.getAllByText('Black hits the center in reply.')).toHaveLength(2)
    expect(container.querySelector(`.${styles.blackMove}`)).not.toBeNull()
    expect(secondTrack).not.toBe(firstTrack)
  })

  it('shows an evaluating indicator next to the arbiter label', () => {
    const { container } = render(
      <ArbiterToastLayer
        evaluation={createResolvedEvaluation()}
        evaluating={true}
      />,
    )
    const status = screen.getByRole('status')

    expect(container.querySelector(`.${styles.statusDot}`)).not.toBeNull()
    expect(status).toHaveAttribute(
      'aria-label',
      'Arbiter evaluation ticker (evaluating now)',
    )
  })

  it('disables the marquee duplicate for reduced motion', () => {
    const evaluation = createResolvedEvaluation()
    stubMatchMedia(true)
    const { container } = render(
      <ArbiterToastLayer evaluation={evaluation} evaluating={false} />,
    )

    const status = screen.getByRole('status')
    const duplicateText = container.querySelector(`.${styles.duplicateText}`)

    expect(status.className).toContain(styles.reducedMotion)
    expect(screen.getAllByText(evaluation.evaluation.comment)).toHaveLength(1)
    expect(duplicateText).toBeNull()
  })
})
