import { useAction, useAtom } from '@reatom/react'
import { isActorKey } from '../../actors/registry'
import { presentError } from '../../shared/errors'
import { ActorSettingsFields } from './actorSettings'
import type { MatchSetupModel } from './model'
import styles from './MatchSetupPage.module.css'

function ActorCard({
  side,
  model,
}: {
  side: 'white' | 'black'
  model: MatchSetupModel
}) {
  const [sideConfig] = useAtom(
    side === 'white' ? model.whiteSideConfig : model.blackSideConfig,
  )
  const [validation] = useAtom(
    side === 'white' ? model.whiteValidation : model.blackValidation,
  )
  const [actor] = useAtom(
    side === 'white' ? model.whiteActorDefinition : model.blackActorDefinition,
  )
  const setSideActor = useAction(model.setSideActor)
  const updateSideConfig = useAction(model.updateSideConfig)
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
                setSideActor(side, nextActorKey)
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
          onChange={(next) => updateSideConfig(side, next)}
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
}

export function MatchSetupPage({
  model,
}: {
  model: MatchSetupModel
}) {
  const [canStart] = useAtom(model.canStart)
  const [setupError] = useAtom(model.setupError)
  const startMatch = useAction(model.startMatch)

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
            void startMatch()
          }}
        >
          Start Match
        </button>
      </div>
    </div>
  )
}
