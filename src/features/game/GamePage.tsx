import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from 'react'
import { getRegisteredActor } from '../../actors/registry'
import { Button } from '../../shared/ui/Button'
import { reatomMemo } from '../../shared/ui/reatomMemo'
import { Board } from '../board/Board'
import type { GameModel } from './model'
import styles from './GamePage.module.css'

const sideLabels = {
  white: 'White',
  black: 'Black',
} as const

type ActorPanelEntry = ReturnType<GameModel['actorPanels']>[number]

function getActorControlsNotice({
  isAtLatestMove,
  phase,
}: Pick<GameModel, 'isAtLatestMove' | 'phase'>): string | null {
  if (!isAtLatestMove()) {
    return 'Editing is disabled in history view. Return to the latest move.'
  }

  if (phase() === 'gameOver') {
    return 'Match finished. Controls are read-only.'
  }

  return null
}

function getBoardModeLabel({
  isAtLatestMove,
  boardInteractive,
  phase,
}: Pick<GameModel, 'isAtLatestMove' | 'boardInteractive' | 'phase'>) {
  if (!isAtLatestMove()) {
    return 'Replay mode'
  }

  if (phase() === 'gameOver') {
    return 'Final position'
  }

  if (phase() === 'actorError') {
    return 'Turn paused'
  }

  if (boardInteractive()) {
    return 'Interactive board'
  }

  return 'Live board'
}

function getBoardHint({
  isAtLatestMove,
  boardInteractive,
  phase,
}: Pick<GameModel, 'isAtLatestMove' | 'boardInteractive' | 'phase'>) {
  if (!isAtLatestMove()) {
    return 'Jump through the move list on the right to inspect earlier positions, then return to the live tail to resume play.'
  }

  if (phase() === 'gameOver') {
    return 'The final board remains available for review.'
  }

  if (phase() === 'actorError') {
    return 'The active turn failed. Resolve the issue or retry the turn to continue.'
  }

  if (boardInteractive()) {
    return 'Select a piece, then choose one of the highlighted legal target squares.'
  }

  return 'The board will update automatically as the active side completes its turn.'
}

function formatMoveLabel(uci: string) {
  const from = uci.slice(0, 2)
  const to = uci.slice(2, 4)
  const promotion = uci.slice(4)

  if (promotion.length > 0) {
    return `${from} to ${to} promote ${promotion.toUpperCase()}`
  }

  return `${from} to ${to}`
}

function formatMoveCount(count: number) {
  return `${count} move${count === 1 ? '' : 's'}`
}

function resolveControlsComponent(
  actorPanel: ActorPanelEntry,
) {
  const descriptor = getRegisteredActor(actorPanel.actorKey)

  return descriptor.ControlsComponent as
    | ComponentType<{
        side: typeof actorPanel.side
        actor: typeof actorPanel.actor
      }>
    | undefined
}

function renderActorControlsPanel({
  actorPanels,
  controlsNotice,
}: {
  actorPanels: Array<ActorPanelEntry>
  controlsNotice: string | null
}) {
  return (
    <aside className={[styles.panel, styles.actorPanel].join(' ')}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeading}>
          <p className={styles.panelEyebrow}>Side management</p>
          <h2 className={styles.panelTitle}>Actors</h2>
        </div>
        <p className={styles.panelNote}>
          Per-side automation and confirmation.
        </p>
      </div>

      {controlsNotice ? (
        <div className={styles.inlineNotice}>
          <p className={styles.inlineNoticeLabel}>Controls unavailable</p>
          <p className={styles.inlineNoticeText}>{controlsNotice}</p>
        </div>
      ) : null}

      <div className={styles.actorSections}>
        {actorPanels.map((actorPanel) => {
          const descriptor = getRegisteredActor(actorPanel.actorKey)
          const ControlsComponent = resolveControlsComponent(actorPanel)
          const cardClassName = [
            styles.actorSection,
            actorPanel.isActive ? styles.actorSectionActive : styles.actorSectionIdle,
          ].join(' ')
          const sideBadgeClassName = [
            styles.sideBadge,
            actorPanel.side === 'white' ? styles.sideBadgeWhite : styles.sideBadgeBlack,
          ].join(' ')

          return (
            <section key={actorPanel.side} className={cardClassName}>
              <div className={styles.actorSectionHeader}>
                <div className={styles.actorSectionBadges}>
                  <span className={sideBadgeClassName}>{sideLabels[actorPanel.side]}</span>
                  <span
                    className={[
                      styles.actorStateBadge,
                      actorPanel.isActive
                        ? styles.actorStateBadgeActive
                        : styles.actorStateBadgeIdle,
                    ].join(' ')}
                  >
                    {actorPanel.isActive ? 'To move' : 'Standing by'}
                  </span>
                </div>
                <span className={styles.actorModeLabel}>
                  {ControlsComponent ? 'Custom controls' : 'Board input'}
                </span>
              </div>

              <div className={styles.actorIdentity}>
                <h3 className={styles.actorTitle}>{actorPanel.displayName}</h3>
                <p className={styles.actorSummary}>{descriptor.summary}</p>
              </div>

              {ControlsComponent && controlsNotice === null ? (
                <div className={styles.actorControlsSlot}>
                  <ControlsComponent side={actorPanel.side} actor={actorPanel.actor} />
                </div>
              ) : (
                <div className={styles.actorInfoCard}>
                  <p className={styles.actorInfoTitle}>
                    {ControlsComponent ? 'Controls are currently read-only' : 'This side uses direct board input'}
                  </p>
                  <p className={styles.actorInfoText}>
                    {ControlsComponent
                      ? controlsNotice ?? descriptor.summary
                      : 'Moves are entered directly on the board when this side is active.'}
                  </p>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </aside>
  )
}

export const GamePage = reatomMemo(({
  model,
}: {
  model: GameModel
}) => {
  const boardPanelRef = useRef<HTMLDivElement | null>(null)
  const historyListRef = useRef<HTMLDivElement | null>(null)
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
  const actorPanels = model.actorPanels()
  const hasActorControls = actorPanels.some((actorPanel) => actorPanel.hasControls)
  const controlsNotice = getActorControlsNotice({
    isAtLatestMove: model.isAtLatestMove,
    phase: model.phase,
  })
  const boardModeLabel = getBoardModeLabel({
    isAtLatestMove: model.isAtLatestMove,
    boardInteractive: model.boardInteractive,
    phase: model.phase,
  })
  const boardHint = getBoardHint({
    isAtLatestMove: model.isAtLatestMove,
    boardInteractive: model.boardInteractive,
    phase: model.phase,
  })
  const currentViewLabel =
    historyCursor === latestMoveCount ? 'Live tail' : `Move ${historyCursor}`

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

    const historyList = historyListRef.current

    if (!historyList) {
      return
    }

    historyList.scrollTop = historyList.scrollHeight
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

      <div className={styles.stage}>
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
          <div className={styles.statusHero}>
            <div className={styles.statusLead}>
              <p className={styles.panelEyebrow}>Match state</p>
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
              <p className={styles.statusDetail}>{statusView.detail}</p>
            </div>

            <div className={styles.metricGrid}>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Turn</span>
                <strong className={styles.metricValue}>{sideLabels[snapshot.turn]}</strong>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>View</span>
                <strong className={styles.metricValue}>{currentViewLabel}</strong>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Moves</span>
                <strong className={styles.metricValue}>{latestMoveCount}</strong>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Actor</span>
                <strong className={styles.metricValue}>
                  {statusView.actorLabel ?? 'System'}
                </strong>
              </div>
            </div>
          </div>

          <div className={styles.statusPills}>
            <span className={styles.statusPill}>{statusText}</span>
            <span className={styles.statusPill}>{boardModeLabel}</span>
            {!isAtLatestMove ? (
              <span className={styles.statusPillMuted}>History view</span>
            ) : null}
            {phase === 'actorError' ? (
              <span className={styles.statusPillCritical}>Action required</span>
            ) : null}
          </div>

          {runtimeError && phase === 'actorError' ? (
            <div className={styles.errorBanner}>
              <p className={styles.errorBannerLabel}>Runtime error</p>
              <p className={styles.errorDetail}>{runtimeError.message}</p>
            </div>
          ) : null}
        </section>

        {hasActorControls
          ? renderActorControlsPanel({
              actorPanels,
              controlsNotice,
            })
          : null}

        <div className={styles.boardRow}>
          <section
            ref={boardPanelRef}
            className={[styles.panel, styles.boardPanel].join(' ')}
          >
            <div className={styles.panelHeader}>
              <div className={styles.panelHeading}>
                <p className={styles.panelEyebrow}>Playfield</p>
                <h2 className={styles.panelTitle}>Board</h2>
              </div>
              <span className={styles.boardModeBadge}>{boardModeLabel}</span>
            </div>

            <p className={styles.boardHint}>{boardHint}</p>

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
          </section>

          <aside className={[styles.panel, styles.historyPanel].join(' ')}>
            <div className={styles.historyTop}>
              <div className={styles.panelHeader}>
                <div className={styles.panelHeading}>
                  <p className={styles.panelEyebrow}>Replay</p>
                  <h2 className={styles.panelTitle}>Move History</h2>
                </div>
                <div className={styles.historySummary}>
                  <span className={styles.historySummaryLabel}>Viewing</span>
                  <strong className={styles.historySummaryValue}>{currentViewLabel}</strong>
                </div>
              </div>

              <div className={styles.historyFacts}>
                <span className={styles.historyFact}>{formatMoveCount(latestMoveCount)}</span>
                <span className={styles.historyFact}>
                  {historyMoves.length + 1} position{historyMoves.length === 0 ? '' : 's'}
                </span>
              </div>

              <div className={styles.historyActions}>
                <Button
                  className={styles.historyActionButton}
                  disabled={!canGoPrevious}
                  onClick={() => {
                    model.goToPreviousMove()
                  }}
                >
                  Previous
                </Button>
                <Button
                  className={styles.historyActionButton}
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
                <span className={styles.historyMoveBody}>
                  <span className={styles.historyMovePrimary}>Initial position</span>
                  <span className={styles.historyMoveSecondary}>
                    Starting board setup
                  </span>
                </span>
              </Button>
              {historyMoves.length === 0 ? (
                <div className={styles.emptyHistory}>No moves yet.</div>
              ) : (
                historyMoves.map((move) => (
                  <Button
                    key={`${move.moveNumber}-${move.uci}`}
                    className={[
                      styles.historyItem,
                      move.isCurrent ? styles.historyItemActive : '',
                    ].join(' ')}
                    onClick={() => {
                      model.goToMove(move.moveNumber)
                    }}
                  >
                    <span className={styles.historyMoveNumber}>{move.moveNumber}</span>
                    <span className={styles.historyMoveBody}>
                      <span className={styles.historyMovePrimary}>
                        {formatMoveLabel(move.uci)}
                      </span>
                      <span className={styles.historyMoveSecondary}>{move.uci}</span>
                    </span>
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
