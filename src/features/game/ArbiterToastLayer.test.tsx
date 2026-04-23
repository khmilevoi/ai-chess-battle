import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import styles from './ArbiterToastLayer.module.css'
import { ArbiterToastLayer } from './ArbiterToastLayer'

const IDLE_TICKER_TEXT = 'Arbiter online. Awaiting the next move.'

function createComment(
  overrides: Partial<{
    id: number
    side: 'white' | 'black'
    text: string
    createdAt: number
  }> = {},
) {
  return {
    id: 1,
    side: 'white' as const,
    text: 'White opens with purpose.',
    createdAt: 1,
    ...overrides,
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
    const { container } = render(<ArbiterToastLayer comment={null} />)
    const status = screen.getByRole('status')
    const duplicateText = container.querySelector('[aria-hidden="true"]')

    expect(status.textContent).toContain('Arbiter')
    expect(screen.getAllByText(IDLE_TICKER_TEXT)).toHaveLength(2)
    expect(container.querySelector(`.${styles.track}`)).not.toBeNull()
    expect(container.querySelector(`.${styles.idle}`)).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Dismiss arbiter comment' })).toBeNull()
    expect(duplicateText?.textContent).toBe(IDLE_TICKER_TEXT)
  })

  it('renders the live comment in the ticker and remounts the track for a new comment id', () => {
    const { container, rerender } = render(
      <ArbiterToastLayer
        comment={createComment({
          id: 1,
          text: 'White opens with purpose.',
        })}
      />,
    )

    const firstTrack = container.querySelector(`.${styles.track}`)

    expect(screen.getAllByText('White opens with purpose.')).toHaveLength(2)
    expect(container.querySelector(`.${styles.whiteMove}`)).not.toBeNull()

    rerender(
      <ArbiterToastLayer
        comment={createComment({
          id: 2,
          side: 'black',
          text: 'Black hits the center in reply.',
        })}
      />,
    )

    const secondTrack = container.querySelector(`.${styles.track}`)

    expect(screen.getAllByText('Black hits the center in reply.')).toHaveLength(2)
    expect(container.querySelector(`.${styles.blackMove}`)).not.toBeNull()
    expect(secondTrack).not.toBe(firstTrack)
  })

  it('disables the marquee duplicate for reduced motion', () => {
    const comment = createComment()
    stubMatchMedia(true)
    const { container } = render(<ArbiterToastLayer comment={comment} />)

    const status = screen.getByRole('status')
    const duplicateText = container.querySelector(`.${styles.duplicateText}`)

    expect(status.className).toContain(styles.reducedMotion)
    expect(screen.getAllByText(comment.text)).toHaveLength(1)
    expect(duplicateText).toBeNull()
  })
})
