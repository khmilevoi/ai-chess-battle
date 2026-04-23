import type { Eval } from '@/arbiter/types'
import styles from './EvalBar.module.css'

function clampScore(score: number): number {
  return Math.max(-1000, Math.min(1000, score))
}

function formatScore(score: number | null): string {
  if (score === null) {
    return '--'
  }

  const pawns = Math.abs(score) / 100

  return `${score >= 0 ? '+' : '-'}${pawns.toFixed(1)}`
}

export function EvalBar({
  evaluation,
}: {
  evaluation: Eval | null
}) {
  const score = evaluation === null ? null : clampScore(evaluation.score)
  const fill = score === null ? 0.5 : (score + 1000) / 2000

  return (
    <section className={styles.wrap} aria-label="Evaluation bar">
      <div
        className={[
          styles.track,
          evaluation === null ? styles.trackDisabled : '',
        ].join(' ')}
      >
        <div
          className={styles.whiteFill}
          style={{ '--fill': `${fill * 100}%` } as React.CSSProperties}
        />
        <div className={styles.centerLine} aria-hidden="true" />
        <span className={styles.score}>{formatScore(score)}</span>
      </div>
    </section>
  )
}
