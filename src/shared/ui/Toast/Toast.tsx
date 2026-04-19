import { X } from 'lucide-react'
import { type Toast as ToastType, dismissToast } from './toastsAtom'
import styles from './Toast.module.css'

type Props = {
  toast: ToastType
}

export function Toast({ toast }: Props) {
  const toneClass = {
    neutral: styles.neutral,
    success: styles.success,
    warning: styles.warning,
    error: styles.error,
  }[toast.tone]

  return (
    <div
      className={[styles.toast, toneClass].join(' ')}
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <div className={styles.body}>
        <p className={styles.title}>{toast.title}</p>
        {toast.description && <p className={styles.description}>{toast.description}</p>}
        {toast.actionLabel && toast.onAction && (
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => {
              toast.onAction?.()
              dismissToast(toast.id)
            }}
          >
            {toast.actionLabel}
          </button>
        )}
      </div>
      <button
        type="button"
        className={styles.closeButton}
        aria-label="Dismiss notification"
        onClick={() => dismissToast(toast.id)}
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  )
}
