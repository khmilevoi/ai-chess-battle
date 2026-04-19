import type { AiActor } from './model'
import type { ActorControlsProps } from '../types'
import { Button } from '@/shared/ui/Button'
import { reatomMemo } from '@/shared/ui/reatomMemo'
import styles from './controls.module.css'

type AiActorControlsProps = ActorControlsProps<AiActor> & {
  providerLabel: string
}

export const AiActorControls = reatomMemo(({
  side,
  sides,
  activeSide,
  actor,
  providerLabel,
}: AiActorControlsProps) => {
  const waitForConfirmation = actor.waitForConfirmation()
  const confirmationPending = actor.confirmationPending()
  const sideLabels = {
    white: 'White',
    black: 'Black',
  } as const
  const isShared = sides.length === 2
  const pendingSide = confirmationPending?.params.side ?? activeSide
  const waitingLabel =
    isShared
      ? 'White & Black'
      : side === 'white'
        ? 'White'
        : 'Black'
  const buttonDisabled = !waitForConfirmation || confirmationPending === null
  const stateText = waitForConfirmation
    ? confirmationPending
      ? pendingSide
        ? `${sideLabels[pendingSide]} is waiting.`
        : 'Waiting for approval.'
      : 'Approval is armed.'
    : 'Requests send automatically.'

  return (
    <div className={styles.controls}>
      <div className={styles.header}>
        <div className={styles.titleWrap}>
          <p className={styles.eyebrow}>{waitingLabel}</p>
          <p className={styles.summary}>{stateText}</p>
        </div>
        <span
          className={[
            styles.stateBadge,
            waitForConfirmation ? styles.stateBadgeManual : styles.stateBadgeAuto,
          ].join(' ')}
        >
          {waitForConfirmation ? 'Manual' : 'Auto'}
        </span>
      </div>

      <label className={styles.toggleCard}>
        <input
          className={styles.checkbox}
          type="checkbox"
          checked={waitForConfirmation}
          onChange={(event) => {
            actor.setWaitForConfirmation(event.target.checked)
          }}
        />
        <span className={styles.toggleCopy}>
          <span className={styles.toggleTitle}>
            Confirm before {providerLabel} request
          </span>
          <span className={styles.toggleHint}>Pause API calls until approved.</span>
        </span>
      </label>

      <div className={styles.actionCard}>
        <div className={styles.actionMeta}>
          <p className={styles.actionLabel}>Next action</p>
          <p className={styles.actionText}>
            {waitForConfirmation
              ? confirmationPending
                ? pendingSide
                  ? `Send for ${sideLabels[pendingSide]}.`
                  : 'Ready to send.'
                : 'Waiting for the next turn.'
              : 'No confirmation step required.'}
          </p>
        </div>
        <Button
          className={styles.actionButton}
          disabled={buttonDisabled}
          onClick={() => {
            actor.confirmMoveRequest()
          }}
        >
          Send {providerLabel} request
        </Button>
      </div>
    </div>
  )
}, 'AiActorControls')
