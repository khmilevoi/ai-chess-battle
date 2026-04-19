import { useCallback, useRef, useState } from 'react'
import styles from './Board.module.css'
import type { BoardSnapshot, PieceSnapshot, Square } from '@/domain/chess/types'
import { PieceIcon } from '@/shared/ui/PieceIcon'
import { reatomMemo } from '@/shared/ui/reatomMemo'
import { boardThemeAtom } from './boardTheme'

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const ranks = ['8', '7', '6', '5', '4', '3', '2', '1']

function squareColor(square: Square) {
  const fileIndex = files.indexOf(square[0] ?? '')
  const rankIndex = ranks.indexOf(square[1] ?? '')
  return (fileIndex + rankIndex) % 2 === 0 ? styles.light : styles.dark
}

function pieceLabel(piece: PieceSnapshot | undefined): string {
  if (!piece) return 'empty'
  const side = piece.side === 'white' ? 'white' : 'black'
  return `${side} ${piece.type}`
}

function squareLabel(square: Square, piece: PieceSnapshot | undefined): string {
  return `${square}, ${pieceLabel(piece)}`
}

const allSquares: Square[] = ranks.flatMap((rank) => files.map((file) => `${file}${rank}`))

function squareIndex(square: Square): number {
  return allSquares.indexOf(square)
}

function navigateSquare(from: Square, direction: 'up' | 'down' | 'left' | 'right'): Square {
  const fileIndex = files.indexOf(from[0] ?? '')
  const rankIndex = ranks.indexOf(from[1] ?? '')

  let nextFile = fileIndex
  let nextRank = rankIndex

  if (direction === 'right') nextFile = Math.min(7, fileIndex + 1)
  if (direction === 'left') nextFile = Math.max(0, fileIndex - 1)
  if (direction === 'up') nextRank = Math.max(0, rankIndex - 1)
  if (direction === 'down') nextRank = Math.min(7, rankIndex + 1)

  return `${files[nextFile]}${ranks[nextRank]}`
}

export const Board = reatomMemo(({
  snapshot,
  selectedSquare,
  legalTargets,
  movableSquares,
  interactive,
  onSquareClick,
}: {
  snapshot: BoardSnapshot
  selectedSquare: Square | null
  legalTargets: Array<Square>
  movableSquares: Array<Square>
  interactive: boolean
  onSquareClick: (square: Square) => void
}) => {
  const pieces = new Map(snapshot.pieces.map((piece) => [piece.square, piece]))
  const lastMoveSquares = new Set(
    snapshot.lastMove ? [snapshot.lastMove.from, snapshot.lastMove.to] : [],
  )

  // Roving tabindex: track which square owns the tab stop
  const defaultFocused = movableSquares[0] ?? 'a1'
  const [rovingSquare, setRovingSquare] = useState<Square>(defaultFocused)
  const buttonRefs = useRef<Map<Square, HTMLButtonElement>>(new Map())

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const directions: Record<string, 'up' | 'down' | 'left' | 'right'> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      }

      const dir = directions[e.key]
      if (dir) {
        e.preventDefault()
        const next = navigateSquare(rovingSquare, dir)
        setRovingSquare(next)
        buttonRefs.current.get(next)?.focus()
        return
      }

      if ((e.key === 'Enter' || e.key === ' ') && interactive) {
        e.preventDefault()
        onSquareClick(rovingSquare)
      }
    },
    [rovingSquare, interactive, onSquareClick],
  )

  const boardTheme = boardThemeAtom()

  return (
    <div className={styles.boardWrap} data-board-theme={boardTheme}>
      <div className={styles.frame}>
        <div
          role="grid"
          aria-label="Chess board"
          aria-colcount={8}
          aria-rowcount={8}
          className={styles.grid}
          onKeyDown={handleKeyDown}
        >
          {ranks.flatMap((rank) =>
            files.map((file) => {
              const square = `${file}${rank}`
              const piece = pieces.get(square)
              const isSelected = selectedSquare === square
              const isTarget = legalTargets.includes(square)
              const isMovable = movableSquares.includes(square)
              const isLastMove = lastMoveSquares.has(square)
              const idx = squareIndex(square)
              const rowIdx = Math.floor(idx / 8) + 1
              const colIdx = (idx % 8) + 1

              return (
                <button
                  key={square}
                  ref={(el) => {
                    if (el) buttonRefs.current.set(square, el)
                    else buttonRefs.current.delete(square)
                  }}
                  type="button"
                  role="gridcell"
                  aria-rowindex={rowIdx}
                  aria-colindex={colIdx}
                  aria-label={squareLabel(square, piece)}
                  aria-selected={isSelected || undefined}
                  tabIndex={square === rovingSquare ? 0 : -1}
                  className={[
                    styles.square,
                    squareColor(square),
                    isSelected ? styles.selected : '',
                    isTarget ? styles.target : '',
                    !isSelected && isMovable ? styles.movable : '',
                    isLastMove ? styles.lastMove : '',
                    !interactive ? styles.disabled : '',
                  ].join(' ')}
                  onClick={() => {
                    if (interactive) {
                      setRovingSquare(square)
                      onSquareClick(square)
                    }
                  }}
                  onFocus={() => setRovingSquare(square)}
                >
                  <span className={styles.coordinate} aria-hidden="true">{square}</span>
                  {piece ? (
                    <span className={styles.piece} aria-hidden="true">
                      <PieceIcon piece={piece} />
                    </span>
                  ) : null}
                </button>
              )
            }),
          )}
        </div>
      </div>
    </div>
  )
}, 'Board')
