import type { PieceSnapshot } from '../../domain/chess/types'
import styles from './PieceIcon.module.css'
import { reatomMemo } from './reatomMemo'

const positions = {
  white: {
    king: [0, 0],
    queen: [20, 0],
    bishop: [40, 0],
    knight: [60, 0],
    rook: [80, 0],
    pawn: [100, 0],
  },
  black: {
    king: [0, 100],
    queen: [20, 100],
    bishop: [40, 100],
    knight: [60, 100],
    rook: [80, 100],
    pawn: [100, 100],
  },
} as const

export const PieceIcon = reatomMemo(({
  piece,
}: {
  piece: PieceSnapshot
}) => {
  const [x, y] = positions[piece.side][piece.type]

  return (
    <div
      className={styles.sprite}
      data-side={piece.side}
      data-type={piece.type}
      style={{ backgroundPosition: `${x}% ${y}%` }}
    />
  )
}, 'PieceIcon')
