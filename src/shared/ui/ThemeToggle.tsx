import { Monitor, Moon, Sun } from 'lucide-react'
import { reatomMemo } from './reatomMemo'
import { setThemePreference, themePreferenceAtom, type ThemePreference } from '@/app/theme'
import styles from './ThemeToggle.module.css'

const CYCLE: ThemePreference[] = ['system', 'light', 'dark']

const LABELS: Record<ThemePreference, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
}

const NEXT_LABELS: Record<ThemePreference, string> = {
  system: 'Switch to light theme',
  light: 'Switch to dark theme',
  dark: 'Switch to system theme',
}

function renderThemeIcon(preference: ThemePreference) {
  if (preference === 'light') return <Sun size={16} aria-hidden />
  if (preference === 'dark') return <Moon size={16} aria-hidden />
  return <Monitor size={16} aria-hidden />
}

export const ThemeToggle = reatomMemo(() => {
  const preference = themePreferenceAtom()

  function cycleTheme() {
    const idx = CYCLE.indexOf(preference)
    const next = CYCLE[(idx + 1) % CYCLE.length]!
    setThemePreference(next)
  }

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={cycleTheme}
      aria-label={NEXT_LABELS[preference]}
      title={`${LABELS[preference]} — ${NEXT_LABELS[preference]}`}
    >
      {renderThemeIcon(preference)}
    </button>
  )
}, 'ThemeToggle')
