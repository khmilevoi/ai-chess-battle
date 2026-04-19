import { action, atom, peek } from '@reatom/core'

export type ToastTone = 'neutral' | 'success' | 'warning' | 'error'

export type Toast = {
  id: string
  tone: ToastTone
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  duration?: number | null
}

let _nextId = 0

const DEFAULT_DURATION: Record<ToastTone, number | null> = {
  neutral: 4000,
  success: 3000,
  warning: 6000,
  error: null, // sticky
}

export const toastsAtom = atom<Toast[]>([], 'ui.toasts')

export const pushToast = action((toast: Omit<Toast, 'id'>) => {
  const id = `toast-${++_nextId}`
  const duration = toast.duration !== undefined ? toast.duration : DEFAULT_DURATION[toast.tone]
  const full: Toast = { ...toast, id, duration }
  toastsAtom.set([...peek(toastsAtom), full])

  if (duration !== null) {
    setTimeout(() => dismissToast(id), duration)
  }

  return id
}, 'ui.pushToast')

export const dismissToast = action((id: string) => {
  toastsAtom.set(peek(toastsAtom).filter((t: Toast) => t.id !== id))
  return id
}, 'ui.dismissToast')

export const dismissAllToasts = action(() => {
  toastsAtom.set([])
}, 'ui.dismissAllToasts')
