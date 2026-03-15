import { useAction, useAtom } from '@reatom/react'
import { appModel } from '../../app/model'
import { setupRoute } from '../../app/routes'
import { Board } from '../board/Board'
import { presentError } from '../../shared/errors'
import styles from './GamePage.module.css'

function formatStatus(snapshot: NonNullable<ReturnType<typeof appModel.snapshot>>) {
  const status = snapshot.status

  if (status.kind === 'active') {
    return `${status.turn} to move`
  }

  if (status.kind === 'check') {
    return `${status.turn} is in check`
  }

  if (status.kind === 'checkmate') {
    return `${status.winner} wins by checkmate`
  }

  if (status.kind === 'stalemate') {
    return 'Stalemate'
  }

  return `Draw: ${status.reason}`
}

export function GamePage() {
  const [snapshot] = useAtom(appModel.snapshot)
  const [phase] = useAtom(appModel.phase)
  const [runtimeError] = useAtom(appModel.runtimeError)
  const [selectedSquare] = useAtom(appModel.selectedSquare)
  const [selectedLegalMoves] = useAtom(appModel.selectedLegalMoves)
  const [movableSquares] = useAtom(appModel.movableSquares)
  const [activeHumanActor] = useAtom(appModel.activeHumanActor)
  const clickSquare = useAction(appModel.clickSquare)
  const retryTurn = useAction(appModel.retryTurn)
  const resetMatch = useAction(appModel.resetMatch)

  if (!snapshot) {
    return (
      <div className={styles.page}>
        <div className={styles.errorBox}>No active match.</div>
        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => {
              resetMatch()
              setupRoute.go(undefined, true)
            }}
          >
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
            <span>{formatStatus(snapshot)}</span>
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
          <button
            type="button"
            onClick={() => {
              resetMatch()
              setupRoute.go(undefined, true)
            }}
          >
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
            interactive={phase === 'playing' && activeHumanActor !== null}
            onSquareClick={(square) => {
              clickSquare(square)
            }}
          />
        </div>

        <aside className={styles.panel}>
          <h2 className={styles.panelTitle}>Position</h2>
          <div className={styles.monoBlock}>{snapshot.fen}</div>
          <h2 className={styles.panelTitle}>Move History</h2>
          <div className={styles.monoBlock}>
            {snapshot.history.length === 0 ? 'No moves yet.' : snapshot.history.join('\n')}
          </div>
        </aside>
      </div>
    </div>
  )
}
