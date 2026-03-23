import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from 'react'
import { getRegisteredActor } from '../../actors/registry'
import { Button } from '../../shared/ui/Button'
import { Board } from '../board/Board'
import type { GameModel } from './model'
import styles from './GamePage.module.css'
import { reatomMemo } from '../../shared/ui/reatomMemo'

const ActiveActorControls = reatomMemo(({
  model,
}: {
  model: GameModel
}) => {
  const controls = model.activeActorControls()

  if (!controls) {
    return null
  }

  const descriptor = getRegisteredActor(controls.actorKey)
  const ControlsComponent =
    descriptor.ControlsComponent as
      | ComponentType<{
          side: typeof controls.side
          actor: typeof controls.actor
        }>
      | undefined

  if (!ControlsComponent) {
    return null
  }

  return <ControlsComponent side={controls.side} actor={controls.actor} />
}, 'ActiveActorControls')

export const GamePage = reatomMemo(({
  model,
}: {
  model: GameModel
}) => {
  const boardPanelRef = useRef<HTMLDivElement | null>(null)
  const historyListRef = useRef<HTMLDivElement | null>(null)
  const latestMoveElementRef = useRef<HTMLButtonElement | null>(null)
  const [boardPanelHeight, setBoardPanelHeight] = useState<number | null>(null)
  const snapshot = model.snapshot()
  const phase = model.phase()
  const runtimeError = model.runtimeError()
  const historyCursor = model.historyCursor()
  const latestMoveCount = model.latestMoveCount()
  const previousMoveCountRef = useRef(latestMoveCount)
  const historyMoves = model.historyMoves()
  const canGoPrevious = model.canGoPrevious()
  const canGoNext = model.canGoNext()
  const isAtLatestMove = model.isAtLatestMove()
  const selectedSquare = model.selectedSquare()
  const selectedLegalMoves = model.selectedLegalMoves()
  const movableSquares = model.movableSquares()
  const statusText = model.statusText()
  const statusView = model.statusView()
  const boardInteractive = model.boardInteractive()
  const activeActorControls = model.activeActorControls()
  const hasActiveActorControls =
    activeActorControls !== null &&
    getRegisteredActor(activeActorControls.actorKey).ControlsComponent !== undefined

  useEffect(() => {
    const boardPanel = boardPanelRef.current

    if (!boardPanel) {
      return
    }

    const syncBoardPanelHeight = () => {
      const nextHeight = Math.round(boardPanel.getBoundingClientRect().height)
      setBoardPanelHeight(nextHeight > 0 ? nextHeight : null)
    }

    syncBoardPanelHeight()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => {
      syncBoardPanelHeight()
    })

    observer.observe(boardPanel)

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const previousMoveCount = previousMoveCountRef.current
    const shouldScrollToLatest =
      latestMoveCount > previousMoveCount && historyCursor === latestMoveCount

    previousMoveCountRef.current = latestMoveCount

    if (!shouldScrollToLatest) {
      return
    }

    const latestMoveElement = latestMoveElementRef.current

    if (latestMoveElement && typeof latestMoveElement.scrollIntoView === 'function') {
      latestMoveElement.scrollIntoView({
        block: 'nearest',
      })
      return
    }

    const historyList = historyListRef.current

    if (historyList) {
      historyList.scrollTop = historyList.scrollHeight
    }
  }, [historyCursor, latestMoveCount])

  const pageStyle =
    boardPanelHeight === null
      ? undefined
      : ({ '--board-panel-height': `${boardPanelHeight}px` } as CSSProperties)

  if (!snapshot) {
    return (
      <div className={styles.page} style={pageStyle}>
        <div className={styles.errorBox}>
          {runtimeError?.message ?? 'Failed to initialize the saved match.'}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page} style={pageStyle}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Saved game</p>
          <h1 className={styles.title}>Live Match</h1>
        </div>
        <div className={styles.headerActions}>
          {phase === 'actorError' && statusView.canRetry ? (
            <Button
              onClick={async () => {
                await model.retryTurn()
              }}
            >
              Retry turn
            </Button>
          ) : null}
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
            <span>
              move {historyCursor} / {latestMoveCount}
            </span>
            <span>{snapshot.turn} turn</span>
            {statusView.actorLabel ? <span>{statusView.actorLabel}</span> : null}
            {!isAtLatestMove ? <span>history view</span> : null}
          </div>
        </div>
        <p className={styles.statusDetail}>{statusView.detail}</p>
        {runtimeError && phase === 'actorError' ? (
          <p className={styles.errorDetail}>{runtimeError.message}</p>
        ) : null}
      </section>

      <div className={styles.layout}>
        <div ref={boardPanelRef} className={styles.panel}>
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

        <div className={styles.sidebar}>
          {hasActiveActorControls ? (
            <aside className={styles.panel}>
              <h2 className={styles.panelTitle}>Actor controls</h2>
              <ActiveActorControls model={model} />
            </aside>
          ) : null}

          <aside className={styles.panel}>
            <h2 className={styles.panelTitle}>Position</h2>
            <div className={styles.monoBlock}>{snapshot.fen}</div>
          </aside>

          <aside className={[styles.panel, styles.historyPanel].join(' ')}>
            <div className={styles.historyHeader}>
              <h2 className={styles.panelTitle}>Move History</h2>
              <div className={styles.historyActions}>
                <Button
                  disabled={!canGoPrevious}
                  onClick={() => {
                    model.goToPreviousMove()
                  }}
                >
                  Previous
                </Button>
                <Button
                  disabled={!canGoNext}
                  onClick={() => {
                    model.goToNextMove()
                  }}
                >
                  Next
                </Button>
              </div>
            </div>

            <div ref={historyListRef} className={styles.historyList}>
              <Button
                className={[
                  styles.historyItem,
                  historyCursor === 0 ? styles.historyItemActive : '',
                ].join(' ')}
                onClick={() => {
                  model.goToMove(0)
                }}
              >
                <span className={styles.historyMoveNumber}>0</span>
                <span>Initial position</span>
              </Button>
              {historyMoves.length === 0 ? (
                <div className={styles.emptyHistory}>No moves yet.</div>
              ) : (
                historyMoves.map((move) => (
                  <Button
                    key={`${move.moveNumber}-${move.uci}`}
                    ref={move.moveNumber === latestMoveCount ? latestMoveElementRef : null}
                    className={[
                      styles.historyItem,
                      move.isCurrent ? styles.historyItemActive : '',
                    ].join(' ')}
                    onClick={() => {
                      model.goToMove(move.moveNumber)
                    }}
                  >
                    <span className={styles.historyMoveNumber}>{move.moveNumber}</span>
                    <span>{move.uci}</span>
                  </Button>
                ))
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}, 'GamePage')
