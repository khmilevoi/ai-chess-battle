import type { CSSProperties } from 'react'
import type { Eval } from '@/arbiter/types'
import styles from './EvalBar.module.css'

function clampScore(score: number): number {
  return Math.max(-1000, Math.min(1000, score))
}

function formatScore(score: number | null): string {
  if (score === null) return '--'
  if (score === 0) return '='
  return `+${(Math.abs(score) / 100).toFixed(1)}`
}

function formatAriaValue(score: number | null): string {
  if (score === null) return 'No evaluation yet'
  if (score === 0) return 'Even position'
  const side = score > 0 ? 'White' : 'Black'
  return `${side} ahead by ${(Math.abs(score) / 100).toFixed(1)} pawns`
}

export function EvalBar({
  evaluation,
}: {
  evaluation: Eval | null
}) {
  const score = evaluation === null ? null : clampScore(evaluation.score)
  const fill = score === null ? 0.5 : (score + 1000) / 2000

  const trackStyle = { '--fill': `${fill * 100}%` } as CSSProperties

  // Position score centered in the winning zone; CSS media query overrides for horizontal layout
  let scoreTop: string
  let scoreBottom: string
  let scoreTransform: string
  let scoreBg: string
  let scoreColor: string

  if (score === null || score === 0) {
    scoreTop = '50%'
    scoreBottom = 'auto'
    scoreTransform = 'translateY(-50%)'
    scoreBg = 'var(--bg-surface)'
    scoreColor = 'var(--text-primary)'
  } else if (score > 0) {
    scoreTop = 'auto'
    scoreBottom = `${fill * 50}%`
    scoreTransform = 'translateY(50%)'
    scoreBg = 'var(--bg-surface)'
    scoreColor = 'var(--text-primary)'
  } else {
    scoreTop = `${(1 - fill) * 50}%`
    scoreBottom = 'auto'
    scoreTransform = 'translateY(-50%)'
    scoreBg = 'var(--bg-inverse)'
    scoreColor = 'var(--text-inverse)'
  }

  const scoreStyle = {
    '--score-top': scoreTop,
    '--score-bottom': scoreBottom,
    '--score-transform': scoreTransform,
    '--score-bg': scoreBg,
    '--score-color': scoreColor,
  } as CSSProperties

  return (
    <section className={styles.wrap} aria-label="Evaluation bar">
      <div
        className={[
          styles.track,
          evaluation === null ? styles.trackDisabled : '',
        ].join(' ')}
        role="meter"
        aria-label="Board evaluation"
        aria-valuemin={-10}
        aria-valuemax={10}
        aria-valuenow={score === null ? 0 : score / 100}
        aria-valuetext={formatAriaValue(score)}
        style={trackStyle}
      >
        <div className={styles.whiteFill} />
        <div className={styles.scoreOverlay} style={scoreStyle} aria-hidden="true">
          {formatScore(score)}
        </div>
      </div>
    </section>
  )
}
