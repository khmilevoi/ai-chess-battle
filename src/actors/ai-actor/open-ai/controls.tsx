import type { ActorControlsProps } from '../../types'
import type { OpenAiActorRuntime } from './model'
import { Button } from '../../../shared/ui/Button'
import { reatomMemo } from '../../../shared/ui/reatomMemo'
import styles from './controls.module.css'

export const OpenAiActorControls = reatomMemo(({
  side,
  actor,
}: ActorControlsProps<OpenAiActorRuntime>) => {
  const waitForConfirmation = actor.waitForConfirmation()
  const confirmationPending = actor.confirmationPending()
  const waitingLabel = side === 'white' ? 'White' : 'Black'
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
                ? 'Waiting for your approval.'
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
                ? 'Ready to send.'
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
