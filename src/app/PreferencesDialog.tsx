import { action, atom } from '@reatom/core'
import { Dialog } from '@/shared/ui/Dialog'
import { reatomMemo } from '@/shared/ui/reatomMemo'
import {
  boardCoordinatesAtom,
  boardDragEnabledAtom,
  boardThemeAtom,
  setBoardTheme,
  type BoardTheme,
} from '@/features/board/boardTheme'
import { setThemePreference, themePreferenceAtom, type ThemePreference } from './theme'
import styles from './PreferencesDialog.module.css'

export const preferencesDialogOpenAtom = atom(false, 'app.preferencesDialogOpen')

export const openPreferencesDialog = action(() => {
  preferencesDialogOpenAtom.set(true)
}, 'app.openPreferencesDialog')

export const closePreferencesDialog = action(() => {
  preferencesDialogOpenAtom.set(false)
}, 'app.closePreferencesDialog')

const BOARD_THEMES: { value: BoardTheme; label: string }[] = [
  { value: 'paper', label: 'Paper' },
  { value: 'graphite', label: 'Graphite' },
  { value: 'crimson', label: 'Crimson' },
  { value: 'slate', label: 'Slate' },
]

const APP_THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export const PreferencesDialog = reatomMemo(() => {
  const open = preferencesDialogOpenAtom()
  const boardTheme = boardThemeAtom()
  const themePreference = themePreferenceAtom()
  const dragEnabled = boardDragEnabledAtom()
  const coordinates = boardCoordinatesAtom()

  return (
    <Dialog open={open} title="Preferences" onClose={() => closePreferencesDialog()}>
      <div className={styles.sections}>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Appearance</h3>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Color theme</span>
            <select
              className={styles.select}
              value={themePreference}
              onChange={(e) => setThemePreference(e.target.value as ThemePreference)}
            >
              {APP_THEMES.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Board theme</span>
            <select
              className={styles.select}
              value={boardTheme}
              onChange={(e) => setBoardTheme(e.target.value as BoardTheme)}
            >
              {BOARD_THEMES.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Board</h3>
          <label className={styles.checkField}>
            <input
              type="checkbox"
              checked={coordinates}
              onChange={(e) => boardCoordinatesAtom.set(e.target.checked)}
            />
            <span className={styles.fieldLabel}>Show coordinates</span>
          </label>
          <label className={styles.checkField}>
            <input
              type="checkbox"
              checked={dragEnabled}
              onChange={(e) => boardDragEnabledAtom.set(e.target.checked)}
            />
            <span className={styles.fieldLabel}>Enable drag-and-drop</span>
          </label>
        </section>
      </div>
    </Dialog>
  )
}, 'PreferencesDialog')
