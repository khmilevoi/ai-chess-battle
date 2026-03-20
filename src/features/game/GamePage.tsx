import { Board } from '../board/Board'
import type { GameModel } from './model'
import styles from './GamePage.module.css'
import { reatomMemo } from '../../shared/ui/reatomMemo'

export const GamePage = reatomMemo(({
  model,
}: {
  model: GameModel
}) => {
  const snapshot = model.snapshot()
  const phase = model.phase()
  const runtimeError = model.runtimeError()
  const selectedSquare = model.selectedSquare()
  const selectedLegalMoves = model.selectedLegalMoves()
  const movableSquares = model.movableSquares()
  const statusText = model.statusText()
  const statusView = model.statusView()
  const historyText = model.historyText()
  const boardInteractive = model.boardInteractive()

  if (!snapshot) {
    return (
      <div className={styles.page}>
        <div className={styles.errorBox}>No active match.</div>
        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => {
              model.leaveMatch()
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
          <p className={styles.eyebrow}>Current session</p>
          <h1 className={styles.title}>Live Match</h1>
        </div>
        <div className={styles.actions}>
          {phase === 'actorError' ? (
            <button
              type="button"
              onClick={async () => {
                await model.retryTurn()
              }}
            >
              Retry turn
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              model.leaveMatch()
            }}
          >
            Back to setup
          </button>
        </div>
      </header>

      <section
        className={[
          styles.statusCard,
          statusView.tone === 'error'
            ? styles.errorTone
            : statusView.tone === 'warning'
            ? styles.warningTone
            : statusView.tone === 'success'
            ? styles.successTone
            : styles.neutralTone,
        ].join(' ')}
        aria-live="polite"
      >
        <div className={styles.statusHeader}>
          <div className={styles.statusTitleRow}>
            <h2 className={styles.statusTitle}>{statusView.title}</h2>
            {statusView.busy ? (
              <span className={styles.busyDots} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            ) : null}
          </div>
          <div className={styles.meta}>
            <span>{statusText}</span>
            <span>{snapshot.history.length} moves logged</span>
            <span>{snapshot.turn} turn</span>
            {statusView.actorLabel ? <span>{statusView.actorLabel}</span> : null}
          </div>
        </div>
        <p className={styles.statusDetail}>{statusView.detail}</p>
        {runtimeError && phase === 'actorError' ? (
          <p className={styles.errorDetail}>{runtimeError.message}</p>
        ) : null}
      </section>

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
              model.clickSquare(square)
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
}, 'GamePage')
