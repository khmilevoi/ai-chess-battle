import { useEffect } from 'react'
import { reatomMemo } from '@/shared/ui/reatomMemo'
import { resolveTheme, themePreferenceAtom } from './theme'

export const ThemeEffect = reatomMemo(() => {
  const preference = themePreferenceAtom()
  const resolved = resolveTheme(preference)

  useEffect(() => {
    document.documentElement.dataset.theme = resolved

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (meta) {
      meta.content = resolved === 'dark' ? '#111111' : '#f4f4f1'
    }
  }, [resolved])

  // Also respond to system preference changes when mode is 'system'
  useEffect(() => {
    if (preference !== 'system' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      document.documentElement.dataset.theme = mq.matches ? 'dark' : 'light'
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [preference])

  return null
}, 'ThemeEffect')
