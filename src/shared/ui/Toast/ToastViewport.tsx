import { createPortal } from 'react-dom'
import { reatomMemo } from '../reatomMemo'
import { Toast } from './Toast'
import { toastsAtom } from './toastsAtom'
import styles from './ToastViewport.module.css'

export const ToastViewport = reatomMemo(() => {
  const toasts = toastsAtom()

  if (toasts.length === 0) return null

  return createPortal(
    <div className={styles.viewport} aria-label="Notifications">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>,
    document.body,
  )
}, 'ToastViewport')
