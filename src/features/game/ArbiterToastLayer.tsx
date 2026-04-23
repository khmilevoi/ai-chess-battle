import { useEffect, useState } from 'react'
import type { BoardSnapshot } from '@/domain/chess/types'
import styles from './ArbiterToastLayer.module.css'

type ArbiterLiveComment = {
  id: number
  side: BoardSnapshot['turn']
  text: string
  createdAt: number
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const IDLE_TICKER_TEXT = 'Arbiter online. Awaiting the next move.'

function getInitialReducedMotionPreference() {
  if (typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

export function ArbiterToastLayer({
  comment,
}: {
  comment: ArbiterLiveComment | null
}) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    getInitialReducedMotionPreference,
  )
  const tickerText = comment?.text ?? IDLE_TICKER_TEXT

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY)
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches)
    }

    setPrefersReducedMotion(mediaQuery.matches)

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)

      return () => {
        mediaQuery.removeEventListener('change', handleChange)
      }
    }

    mediaQuery.addListener(handleChange)

    return () => {
      mediaQuery.removeListener(handleChange)
    }
  }, [])

  return (
    <article
      className={[
        styles.toast,
        comment === null
          ? styles.idle
          : comment.side === 'white'
          ? styles.whiteMove
          : styles.blackMove,
        prefersReducedMotion ? styles.reducedMotion : '',
      ].join(' ')}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <p className={styles.label}>Arbiter</p>

      <div className={styles.viewport}>
        <div key={comment?.id ?? 'idle'} className={styles.track}>
          <p className={styles.text}>{tickerText}</p>
          {prefersReducedMotion ? null : (
            <p className={[styles.text, styles.duplicateText].join(' ')} aria-hidden="true">
              {tickerText}
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
