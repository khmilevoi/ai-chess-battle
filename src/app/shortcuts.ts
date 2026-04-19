import { action, atom, peek } from '@reatom/core'

export type ShortcutContext = 'global' | 'game' | 'setup'

export type ShortcutEntry = {
  key: string
  modifiers?: string[]
  description: string
  context: ShortcutContext
  handler: () => void
}

const shortcutsRegistryAtom = atom<ShortcutEntry[]>([], 'app.shortcuts')

export const registerShortcut = action((entry: ShortcutEntry) => {
  shortcutsRegistryAtom.set([...peek(shortcutsRegistryAtom), entry])
  return entry
}, 'app.registerShortcut')

export const unregisterShortcut = action((key: string, context: ShortcutContext) => {
  shortcutsRegistryAtom.set(
    peek(shortcutsRegistryAtom).filter((s) => !(s.key === key && s.context === context)),
  )
}, 'app.unregisterShortcut')

export const shortcutsAtom = shortcutsRegistryAtom

function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    (el as HTMLElement).isContentEditable
  )
}

export function initGlobalShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (isInputFocused() && e.key !== 'Escape') return
    if (e.metaKey || e.ctrlKey || e.altKey) return

    const shortcuts = peek(shortcutsRegistryAtom)
    for (const shortcut of shortcuts) {
      if (shortcut.key === e.key) {
        e.preventDefault()
        shortcut.handler()
        return
      }
    }
  })
}
