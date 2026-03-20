import { isActorKey } from '../../actors/registry'
import { presentError } from '../../shared/errors'
import { reatomMemo } from '../../shared/ui/reatomMemo'
import { ActorSettingsFields } from './actorSettings'
import type { MatchSetupModel } from './model'
import styles from './MatchSetupPage.module.css'

const ActorCard = reatomMemo(({
  side,
  model,
}: {
  side: 'white' | 'black'
  model: MatchSetupModel
}) => {
  const sideConfig =
    side === 'white' ? model.whiteSideConfig() : model.blackSideConfig()
  const validation =
    side === 'white' ? model.whiteValidation() : model.blackValidation()
  const actor =
    side === 'white' ? model.whiteActorDefinition() : model.blackActorDefinition()
  const panelClass =
    side === 'white'
      ? `${styles.panel} ${styles.lightPanel}`
      : `${styles.panel} ${styles.darkPanel}`

  return (
    <section className={panelClass}>
      <div>
        <p className={styles.eyebrow}>{side} side</p>
        <h2 className={styles.sideTitle}>{actor.displayName}</h2>
        <p className={styles.summary}>{actor.summary}</p>
      </div>
      <div className={styles.fieldGroup}>
        <label>
          <span>Actor</span>
          <select
            value={sideConfig.actorKey}
            onChange={(event) => {
              const nextActorKey = event.target.value

              if (isActorKey(nextActorKey)) {
                model.setSideActor(side, nextActorKey)
              }
            }}
          >
            {model.availableActors.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.customFields}>
        <ActorSettingsFields
          side={side}
          sideConfig={sideConfig}
          onChange={(next) => model.updateSideConfig(side, next)}
          errors={validation.fieldErrors}
        />
      </div>
      {validation.error ? (
        <ul className={styles.errorList}>
          <li>{presentError(validation.error)}</li>
        </ul>
      ) : null}
    </section>
  )
}, 'ActorCard')

export const MatchSetupPage = reatomMemo(({
  model,
}: {
  model: MatchSetupModel
}) => {
  const canStart = model.canStart()
  const setupError = model.setupError()
  const activeGameSummary = model.activeGameSummary()

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>AI Chess Battle</p>
        <h1 className={styles.title}>Configure both sides, then let one game loop run.</h1>
        <p className={styles.subtitle}>
          Every match uses the same orchestration contract. White and black only
          differ by actor implementation and config.
        </p>
      </header>

      {activeGameSummary ? (
        <section className={styles.resumeCard}>
          <div className={styles.resumeMeta}>
            <p className={styles.eyebrow}>Active match</p>
            <h2 className={styles.resumeTitle}>Resume your last game</h2>
            <p className={styles.resumeSummary}>{activeGameSummary.statusText}</p>
            <div className={styles.resumeFacts}>
              <span>{activeGameSummary.moveCount} moves played</span>
              <span>{activeGameSummary.turn} turn</span>
              <span>{activeGameSummary.isFinished ? 'finished' : 'in progress'}</span>
            </div>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={() => {
                model.resumeActiveMatch()
              }}
            >
              Resume Match
            </button>
          </div>
        </section>
      ) : null}

      <div className={styles.grid}>
        <ActorCard side="white" model={model} />
        <ActorCard side="black" model={model} />
      </div>

      {setupError ? (
        <div className={styles.inlineError}>{presentError(setupError)}</div>
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primaryAction}
          disabled={!canStart}
          onClick={() => {
            void model.startMatch()
          }}
        >
          Start Match
        </button>
      </div>
    </div>
  )
}, 'MatchSetupPage')
