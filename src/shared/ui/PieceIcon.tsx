import type { PieceSnapshot } from '../../domain/chess/types'
import styles from './PieceIcon.module.css';
import clsx from 'clsx';

const positions = {
  white: {
    king: [-1, 0],
    queen: [20, 0],
    bishop: [40, 0],
    knight: [60, 0],
    rook: [80, 0],
    pawn: [100, 0],
  },
  black: {
    king: [-1, 100],
    queen: [20, 100],
    bishop: [40, 100],
    knight: [60, 100],
    rook: [80, 100],
    pawn: [100, 100],
  },
} as const

export function PieceIcon({ piece }: { piece: PieceSnapshot }) {
  const [x, y] = positions[piece.side][piece.type]

  return <div className={clsx(styles.sprite, piece.side, piece.type)} style={{ backgroundPosition: `${x}% ${y}%` }}></div>
}
