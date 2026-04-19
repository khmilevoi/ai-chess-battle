import {
  useEffect,
  useRef,
  type ComponentType,
} from 'react'
import { getRegisteredActor } from '@/actors/registry'
import type { ActorMatchInfoProps } from '@/actors/types'
import { Button } from '@/shared/ui/Button'
import { reatomMemo } from '@/shared/ui/reatomMemo'
import { Board } from '../board/Board'
import type { GameModel } from './model'
import styles from './GamePage.module.css'

const sideLabels = {
  white: 'White',
  black: 'Black',
} as const

type ActorPanelEntry = ReturnType<GameModel['actorPanels']>[number]
type MatchInfoEntry = ReturnType<GameModel['matchInfoEntries']>[number]

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
        sides: typeof actorPanel.sides
        activeSide: typeof actorPanel.activeSide
        actor: typeof actorPanel.actor
      }>
    | undefined
}

function resolveMatchInfoComponent(matchInfoEntry: MatchInfoEntry) {
  const descriptor = getRegisteredActor(matchInfoEntry.actorKey)

  return descriptor.MatchInfoComponent as ComponentType<ActorMatchInfoProps<unknown>>
}

function renderActorControlsPanel({
  actorPanels,
  controlsNotice,
}: {
  actorPanels: Array<ActorPanelEntry>
  controlsNotice: string | null
}) {
  const showActorNames = actorPanels.length > 1

  return (
    <aside className={[styles.panel, styles.actorPanel].join(' ')}>
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
          return (
            <section key={actorPanel.panelKey} className={styles.actorSection}>
              {showActorNames ? (
                <div className={styles.actorIdentity}>
                  <h3 className={styles.actorTitle}>{actorPanel.displayName}</h3>
                </div>
              ) : null}

              {ControlsComponent && controlsNotice === null ? (
                <div className={styles.actorControlsSlot}>
                  <ControlsComponent
                    side={actorPanel.side}
                    sides={actorPanel.sides}
                    activeSide={actorPanel.activeSide}
                    actor={actorPanel.actor}
                  />
                </div>
              ) : (
                <div className={styles.actorInfoCard}>
                  <p className={styles.actorInfoTitle}>
                    {ControlsComponent ? 'Read-only' : 'Board input'}
                  </p>
                  <p className={styles.actorInfoText}>
                    {ControlsComponent
                      ? controlsNotice ?? descriptor.summary
                      : 'Move on the board when this side is active.'}
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

function renderMatchInfoPanel({
  matchInfoEntries,
}: {
  matchInfoEntries: Array<MatchInfoEntry>
}) {
  return (
    <>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeading}>
          <p className={styles.panelEyebrow}>Match info</p>
          <h2 className={styles.panelTitle}>Saved setup</h2>
        </div>
      </div>

      <div className={styles.matchInfoSections}>
        {matchInfoEntries.map((matchInfoEntry) => {
          const MatchInfoComponent = resolveMatchInfoComponent(matchInfoEntry)

          return (
            <section key={matchInfoEntry.side} className={styles.matchInfoSection}>
              <div className={styles.matchInfoHeader}>
                <span
                  className={[
                    styles.sideBadge,
                    matchInfoEntry.side === 'white'
                      ? styles.sideBadgeWhite
                      : styles.sideBadgeBlack,
                  ].join(' ')}
                >
                  {sideLabels[matchInfoEntry.side]}
                </span>
              </div>

              <div className={styles.actorIdentity}>
                <h3 className={styles.actorTitle}>{matchInfoEntry.displayName}</h3>
                <p className={styles.actorSummary}>{matchInfoEntry.summary}</p>
              </div>

              <div className={styles.matchInfoSlot}>
                <MatchInfoComponent
                  side={matchInfoEntry.side}
                  value={matchInfoEntry.actorConfig}
                />
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}

export const GamePage = reatomMemo(({
  model,
}: {
  model: GameModel
}) => {
  const historyListRef = useRef<HTMLOListElement | null>(null)
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
  const statusView = model.statusView()
  const boardInteractive = model.boardInteractive()
  const actorPanels = model.actorPanels()
  const matchInfoEntries = model.matchInfoEntries()
  const hasActorControls = actorPanels.some((actorPanel) => actorPanel.hasControls)
  const controlsNotice = getActorControlsNotice({
    isAtLatestMove: model.isAtLatestMove,
    phase: model.phase,
  })
  const currentViewLabel =
    historyCursor === latestMoveCount ? 'Live tail' : `Move ${historyCursor}`

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

  if (!snapshot) {
    return (
      <div className={styles.page}>
        <div className={styles.errorBox}>
          {runtimeError?.message ?? 'Failed to initialize the saved match.'}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.stage}>
        <aside className={[styles.rail, styles.leftRail].join(' ')}>
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

            <div className={styles.statusMeta}>
              <span>{sideLabels[snapshot.turn]} to move</span>
              <span>{formatMoveCount(latestMoveCount)}</span>
              {!isAtLatestMove ? (
                <span>{currentViewLabel}</span>
              ) : null}
            </div>

            {phase === 'actorError' && statusView.canRetry ? (
              <div className={styles.statusActions}>
                <Button
                  className={styles.statusActionButton}
                  onClick={async () => {
                    await model.retryTurn()
                  }}
                >
                  Retry turn
                </Button>
              </div>
            ) : null}

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

          <aside className={[styles.panel, styles.matchInfoPanel].join(' ')}>
            {renderMatchInfoPanel({
              matchInfoEntries,
            })}
          </aside>
        </aside>

        <main className={styles.boardZone} aria-label="Chess board area">
          <section className={styles.boardPanel}>
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
        </main>

        <aside className={[styles.rail, styles.rightRail].join(' ')}>
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
                  disabled={isAtLatestMove}
                  onClick={() => {
                    model.goToMove(latestMoveCount)
                  }}
                >
                  Back to latest
                </Button>
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

            <ol ref={historyListRef} className={styles.historyList}>
              <li className={styles.historyStep}>
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
                    <span className={styles.historyMoveSecondary}>Starting board</span>
                  </span>
                </Button>
              </li>
              {historyMoves.length === 0 ? (
                <li className={styles.emptyHistory}>No moves yet.</li>
              ) : (
                historyMoves.map((move) => (
                  <li key={`${move.moveNumber}-${move.uci}`} className={styles.historyStep}>
                    <Button
                      className={[
                        styles.historyItem,
                        move.moveNumber === historyCursor ? styles.historyItemActive : '',
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
                  </li>
                ))
              )}
            </ol>
          </aside>
        </aside>
      </div>
    </div>
  )
}, 'GamePage')
