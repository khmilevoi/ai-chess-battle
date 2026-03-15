import { useAction, useAtom } from '@reatom/react'
import { appModel } from '../../app/model'
import { gameRoute } from '../../app/routes'
import { presentError } from '../../shared/errors'
import styles from './MatchSetupPage.module.css'

function ActorCard({
  side,
}: {
  side: 'white' | 'black'
}) {
  const [sideConfig] = useAtom(
    side === 'white' ? appModel.whiteSideConfig : appModel.blackSideConfig,
  )
  const [validation] = useAtom(
    side === 'white' ? appModel.whiteValidation : appModel.blackValidation,
  )
  const setSideActor = useAction(appModel.setSideActor)
  const updateSideConfig = useAction(appModel.updateSideConfig)
  const actor = appModel.availableActors.find(
    (entry) => entry.key === sideConfig.actorKey,
  )!
  const SettingsComponent = actor.SettingsComponent
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
            onChange={(event) =>
              setSideActor(side, event.target.value as typeof sideConfig.actorKey)
            }
          >
            {appModel.availableActors.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.customFields}>
        <SettingsComponent
          side={side}
          value={sideConfig.actorConfig as never}
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

export function MatchSetupPage() {
  const [readyConfig] = useAtom(appModel.whiteValidation)
  const [blackValidation] = useAtom(appModel.blackValidation)
  const [setupError] = useAtom(appModel.setupError)
  const startMatch = useAction(appModel.startMatch)
  const canStart = readyConfig.config !== null && blackValidation.config !== null

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
        <ActorCard side="white" />
        <ActorCard side="black" />
      </div>

      {setupError ? (
        <div className={styles.inlineError}>{presentError(setupError)}</div>
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primaryAction}
          disabled={!canStart}
          onClick={async () => {
            const result = await startMatch()
            if (!(result instanceof Error)) {
              gameRoute.go(undefined, true)
            }
          }}
        >
          Start Match
        </button>
      </div>
    </div>
  )
}
