import type { ActorControlsProps } from '../types'
import type { OpenAiActorRuntime } from './model'
import { reatomMemo } from '../../shared/ui/reatomMemo'

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
    <div>
      <p>{waitingLabel} request controls</p>
      <label>
        <input
          type="checkbox"
          checked={waitForConfirmation}
          onChange={(event) => {
            actor.setWaitForConfirmation(event.target.checked)
          }}
        />
        <span>Wait for confirmation before sending the OpenAI request</span>
      </label>
      <p>
        {waitForConfirmation
          ? confirmationPending
            ? 'The current turn is waiting for your confirmation.'
            : 'The next turn will pause before contacting OpenAI.'
          : 'Requests are sent automatically when the turn starts.'}
      </p>
      <button
        type="button"
        disabled={buttonDisabled}
        onClick={() => {
          actor.confirmMoveRequest()
        }}
      >
        Send OpenAI request
      </button>
    </div>
  )
}, 'OpenAiActorControls')
