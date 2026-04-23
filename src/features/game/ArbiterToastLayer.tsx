import { useCallback, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { BoardSnapshot } from '@/domain/chess/types'
import styles from './ArbiterToastLayer.module.css'

type ArbiterLiveComment = {
  id: number
  side: BoardSnapshot['turn']
  text: string
  createdAt: number
}

const TOAST_DURATION_MS = 6000

export function ArbiterToastLayer({
  comment,
  onDismiss,
}: {
  comment: ArbiterLiveComment | null
  onDismiss: () => void
}) {
  const timeoutRef = useRef<number | null>(null)
  const remainingMsRef = useRef(TOAST_DURATION_MS)
  const startedAtRef = useRef<number | null>(null)
  const pausedRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const scheduleDismiss = useCallback(() => {
    if (comment === null || pausedRef.current) {
      return
    }

    clearTimer()
    startedAtRef.current = Date.now()
    timeoutRef.current = window.setTimeout(() => {
      onDismiss()
    }, remainingMsRef.current)
  }, [clearTimer, comment, onDismiss])

  const pauseDismiss = useCallback(() => {
    if (comment === null || pausedRef.current) {
      return
    }

    pausedRef.current = true

    if (startedAtRef.current !== null) {
      remainingMsRef.current = Math.max(
        0,
        remainingMsRef.current - (Date.now() - startedAtRef.current),
      )
      startedAtRef.current = null
    }

    clearTimer()
  }, [clearTimer, comment])

  const resumeDismiss = useCallback(() => {
    if (comment === null || !pausedRef.current) {
      return
    }

    pausedRef.current = false

    if (remainingMsRef.current <= 0) {
      onDismiss()
      return
    }

    scheduleDismiss()
  }, [comment, onDismiss, scheduleDismiss])

  useEffect(() => {
    clearTimer()
    pausedRef.current = false
    remainingMsRef.current = TOAST_DURATION_MS
    startedAtRef.current = null

    if (comment === null) {
      return
    }

    scheduleDismiss()

    return () => {
      clearTimer()
    }
  }, [clearTimer, comment, scheduleDismiss])

  useEffect(() => {
    if (comment === null) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismiss()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [comment, onDismiss])

  if (comment === null) {
    return null
  }

  return (
    <div className={styles.layer} aria-live="polite" aria-atomic="true">
      <article
        className={[
          styles.toast,
          comment.side === 'white' ? styles.whiteMove : styles.blackMove,
        ].join(' ')}
        role="status"
        onMouseEnter={pauseDismiss}
        onMouseLeave={resumeDismiss}
        onFocusCapture={pauseDismiss}
        onBlurCapture={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
            return
          }

          resumeDismiss()
        }}
      >
        <div className={styles.body}>
          <p className={styles.label}>Arbiter</p>
          <p className={styles.text}>{comment.text}</p>
        </div>

        <button
          type="button"
          className={styles.closeButton}
          aria-label="Dismiss arbiter comment"
          onClick={onDismiss}
        >
          <X size={14} aria-hidden />
        </button>
      </article>
    </div>
  )
}
