import { action, atom, withLocalStorage } from '@reatom/core'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'ai-chess-battle.theme'
const STORAGE_VERSION = 'theme@1'

export const themePreferenceAtom = atom<ThemePreference>('system', 'app.themePreference').extend(
  withLocalStorage({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    fromSnapshot: (snapshot, state) => {
      if (snapshot === 'system' || snapshot === 'light' || snapshot === 'dark') {
        return snapshot
      }
      return state ?? 'system'
    },
  }),
)

export const setThemePreference = action((preference: ThemePreference) => {
  themePreferenceAtom.set(preference)
  return preference
}, 'app.setThemePreference')

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}
