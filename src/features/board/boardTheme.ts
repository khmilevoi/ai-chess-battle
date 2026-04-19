import { action, atom, withLocalStorage } from '@reatom/core'

export type BoardTheme = 'paper' | 'graphite' | 'crimson' | 'slate'

export const boardThemeAtom = atom<BoardTheme>('paper', 'board.theme').extend(
  withLocalStorage({
    key: 'ai-chess-battle.board-theme',
    version: 'board-theme@1',
    fromSnapshot: (snapshot, state) => {
      if (
        snapshot === 'paper' ||
        snapshot === 'graphite' ||
        snapshot === 'crimson' ||
        snapshot === 'slate'
      ) {
        return snapshot
      }
      return state ?? 'paper'
    },
  }),
)

export const boardDragEnabledAtom = atom<boolean>(false, 'board.dragEnabled').extend(
  withLocalStorage({
    key: 'ai-chess-battle.board-drag',
    version: 'board-drag@1',
    fromSnapshot: (snapshot, state) => {
      return typeof snapshot === 'boolean' ? snapshot : (state ?? false)
    },
  }),
)

export const boardCoordinatesAtom = atom<boolean>(true, 'board.coordinates').extend(
  withLocalStorage({
    key: 'ai-chess-battle.board-coordinates',
    version: 'board-coordinates@1',
    fromSnapshot: (snapshot, state) => {
      return typeof snapshot === 'boolean' ? snapshot : (state ?? true)
    },
  }),
)

export const setBoardTheme = action((theme: BoardTheme) => {
  boardThemeAtom.set(theme)
  return theme
}, 'board.setBoardTheme')
