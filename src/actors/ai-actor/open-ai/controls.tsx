import type { ActorControlsProps } from '../../types'
import type { OpenAiActorRuntime } from './model'
import { Button } from '../../../shared/ui/Button'
import { reatomMemo } from '../../../shared/ui/reatomMemo'
import styles from './controls.module.css'

export const OpenAiActorControls = reatomMemo(({
  side,
  sides,
  activeSide,
  actor,
}: ActorControlsProps<OpenAiActorRuntime>) => {
  const waitForConfirmation = actor.waitForConfirmation()
  const confirmationPending = actor.confirmationPending()
  const sideLabels = {
    white: 'White',
    black: 'Black',
  } as const
  const isShared = sides.length === 2
  const pendingSide = confirmationPending?.params.side ?? activeSide
  const waitingLabel = isShared
    ? 'White & Black'
    : side === 'white'
      ? 'White'
      : 'Black'
  const buttonDisabled =
    !waitForConfirmation || confirmationPending === null

  return (
    <div className={styles.controls}>
      <div className={styles.header}>
        <div className={styles.titleWrap}>
          <p className={styles.eyebrow}>{waitingLabel} request controls</p>
          <p className={styles.summary}>
            {waitForConfirmation
              ? confirmationPending
                ? pendingSide
                  ? `${sideLabels[pendingSide]} is waiting for your approval.`
                  : 'Waiting for your approval.'
                : isShared
                  ? 'Both sides pause before the next OpenAI request.'
                  : 'Next turn pauses for approval.'
              : 'Requests are sent automatically.'}
          </p>
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
            Wait for confirmation before sending the OpenAI request
          </span>
          <span className={styles.toggleHint}>
            Enable this only when you want to inspect the position before the API
            call.
          </span>
        </span>
      </label>

      <div className={styles.actionCard}>
        <div className={styles.actionMeta}>
          <p className={styles.actionLabel}>Current state</p>
          <p className={styles.actionText}>
            {waitForConfirmation
              ? confirmationPending
                ? pendingSide
                  ? `Ready to send for ${sideLabels[pendingSide]}.`
                  : 'Ready to send.'
                : isShared
                  ? 'Shared confirmation is armed for both sides.'
                  : 'Standing by for the next turn.'
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
          Send OpenAI request
        </Button>
      </div>
    </div>
  )
}, 'OpenAiActorControls')
