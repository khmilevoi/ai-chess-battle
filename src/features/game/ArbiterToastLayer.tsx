import { useEffect, useState } from 'react'
import { getMoveSide, type ResolvedEvaluation } from './model'
import styles from './ArbiterToastLayer.module.css'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const IDLE_TICKER_TEXT = 'Arbiter online. Awaiting the next move.'

function getInitialReducedMotionPreference() {
  if (typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

export function ArbiterToastLayer({
  evaluation,
  evaluating,
}: {
  evaluation: ResolvedEvaluation | null
  evaluating: boolean
}) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    getInitialReducedMotionPreference,
  )
  const tickerText = evaluation?.evaluation.comment ?? IDLE_TICKER_TEXT
  const sideClass =
    evaluation === null
      ? styles.idle
      : getMoveSide(evaluation.moveIndex) === 'white'
      ? styles.whiteMove
      : styles.blackMove

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY)
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches)
    }

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
        sideClass,
        prefersReducedMotion ? styles.reducedMotion : '',
      ].join(' ')}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`Arbiter evaluation ticker${evaluating ? ' (evaluating now)' : ''}`}
    >
      <p className={styles.label}>
        Arbiter
        {evaluating ? (
          <span className={styles.statusDot} aria-hidden="true" />
        ) : null}
      </p>

      <div className={styles.viewport}>
        <div key={evaluation?.moveIndex ?? 'idle'} className={styles.track}>
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
