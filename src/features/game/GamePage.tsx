import { useAction, useAtom } from '@reatom/react'
import { Board } from '../board/Board'
import { presentError } from '../../shared/errors'
import type { GameModel } from './model'
import styles from './GamePage.module.css'

export function GamePage({
  model,
}: {
  model: GameModel
}) {
  const [snapshot] = useAtom(model.snapshot)
  const [phase] = useAtom(model.phase)
  const [runtimeError] = useAtom(model.runtimeError)
  const [selectedSquare] = useAtom(model.selectedSquare)
  const [selectedLegalMoves] = useAtom(model.selectedLegalMoves)
  const [movableSquares] = useAtom(model.movableSquares)
  const [statusText] = useAtom(model.statusText)
  const [historyText] = useAtom(model.historyText)
  const [boardInteractive] = useAtom(model.boardInteractive)
  const clickSquare = useAction(model.clickSquare)
  const retryTurn = useAction(model.retryTurn)
  const leaveMatch = useAction(model.leaveMatch)

  if (!snapshot) {
    return (
      <div className={styles.page}>
        <div className={styles.errorBox}>No active match.</div>
        <div className={styles.actions}>
          <button type="button" onClick={() => leaveMatch()}>
            Back to setup
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Live Match</h1>
          <div className={styles.meta}>
            <span>{statusText}</span>
            <span>{snapshot.history.length} moves logged</span>
            <span>{snapshot.turn} turn</span>
          </div>
        </div>
        <div className={styles.actions}>
          {phase === 'actorError' ? (
            <button
              type="button"
              onClick={async () => {
                await retryTurn()
              }}
            >
              Retry turn
            </button>
          ) : null}
          <button type="button" onClick={() => leaveMatch()}>
            Back to setup
          </button>
        </div>
      </header>

      {runtimeError ? (
        <div className={styles.errorBox}>{presentError(runtimeError)}</div>
      ) : null}

      <div className={styles.layout}>
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Board</h2>
          <Board
            snapshot={snapshot}
            selectedSquare={selectedSquare}
            legalTargets={selectedLegalMoves}
            movableSquares={movableSquares}
            interactive={boardInteractive}
            onSquareClick={(square) => {
              clickSquare(square)
            }}
          />
        </div>

        <aside className={styles.panel}>
          <h2 className={styles.panelTitle}>Position</h2>
          <div className={styles.monoBlock}>{snapshot.fen}</div>
          <h2 className={styles.panelTitle}>Move History</h2>
          <div className={styles.monoBlock}>{historyText}</div>
        </aside>
      </div>
    </div>
  )
}
