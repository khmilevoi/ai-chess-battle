import styles from './Board.module.css'
import type { BoardSnapshot, Square } from '@/domain/chess/types'
import { PieceIcon } from '@/shared/ui/PieceIcon'
import { reatomMemo } from '@/shared/ui/reatomMemo'

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const ranks = ['8', '7', '6', '5', '4', '3', '2', '1']

function squareColor(square: Square) {
  const fileIndex = files.indexOf(square[0] ?? '')
  const rankIndex = ranks.indexOf(square[1] ?? '')
  return (fileIndex + rankIndex) % 2 === 0 ? styles.light : styles.dark
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

  return (
    <div className={styles.boardWrap}>
      <div className={styles.frame}>
        <div className={styles.grid}>
          {ranks.flatMap((rank) =>
            files.map((file) => {
              const square = `${file}${rank}`
              const piece = pieces.get(square)
              const isSelected = selectedSquare === square
              const isTarget = legalTargets.includes(square)
              const isMovable = movableSquares.includes(square)
              const isLastMove = lastMoveSquares.has(square)

              return (
                <button
                  key={square}
                  type="button"
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
                    if (interactive) onSquareClick(square)
                  }}
                >
                  <span className={styles.coordinate}>{square}</span>
                  {piece ? (
                    <span className={styles.piece}>
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
