import type { PieceSnapshot } from '../../domain/chess/types'

const glyphs = {
  white: {
    king: '♔',
    queen: '♕',
    rook: '♖',
    bishop: '♗',
    knight: '♘',
    pawn: '♙',
  },
  black: {
    king: '♚',
    queen: '♛',
    rook: '♜',
    bishop: '♝',
    knight: '♞',
    pawn: '♟',
  },
} as const

export function PieceIcon({ piece }: { piece: PieceSnapshot }) {
  const glyph = glyphs[piece.side][piece.type]
  const fill = piece.side === 'white' ? '#ffffff' : '#050505'
  const stroke = piece.side === 'white' ? '#050505' : '#ffffff'

  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" fill="none" />
      <text
        x="50"
        y="68"
        textAnchor="middle"
        fontSize="64"
        fontFamily="'Iowan Old Style', 'Palatino Linotype', serif"
        fill={fill}
        stroke={stroke}
        strokeWidth="2"
      >
        {glyph}
      </text>
    </svg>
  )
}
