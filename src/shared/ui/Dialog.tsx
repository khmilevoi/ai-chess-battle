import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import styles from './Dialog.module.css'

type DialogProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  dismissible?: boolean
}

function focusFirstFocusable(container: HTMLElement | null) {
  if (container === null) {
    return
  }

  const target = container.querySelector<HTMLElement>(
    'input, button, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
  )

  target?.focus()
}

export function Dialog({
  open,
  title,
  onClose,
  children,
  dismissible = true,
}: DialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    focusFirstFocusable(panelRef.current)
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault()
        onClose()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [dismissible, onClose, open])

  if (!open) {
    return null
  }

  return createPortal(
    <div
      className={styles.overlay}
      onClick={() => {
        if (dismissible) {
          onClose()
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.panel}
        onClick={(event) => {
          event.stopPropagation()
        }}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <Button
            className={styles.closeButton}
            disabled={!dismissible}
            onClick={() => {
              if (dismissible) {
                onClose()
              }
            }}
          >
            Close
          </Button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
