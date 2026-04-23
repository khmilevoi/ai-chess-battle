import { isActorKey, type ActorKey } from '@/actors/registry'
import { isArbiterKey, type ArbiterProviderKey } from '@/arbiter/registry'
import { presentError } from '@/shared/errors'
import { Button, PrimaryButton, SecondaryButton } from '@/shared/ui/Button'
import { reatomMemo } from '@/shared/ui/reatomMemo'
import { ArbiterProviderSettings } from './ArbiterProviderSettings'
import { ActorSettingsFields } from './actorSettings'
import type { MatchSetupModel } from './model'
import styles from './MatchSetupPage.module.css'

const PRESETS: { label: string; white: ActorKey; black: ActorKey }[] = [
  { label: 'You vs OpenAI', white: 'human', black: 'openai' },
  { label: 'You vs Anthropic', white: 'human', black: 'anthropic' },
  { label: 'You vs Google', white: 'human', black: 'google' },
  { label: 'OpenAI vs Anthropic', white: 'openai', black: 'anthropic' },
  { label: 'Human vs Human', white: 'human', black: 'human' },
]

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

const ArbiterCard = reatomMemo(({
  model,
}: {
  model: MatchSetupModel
}) => {
  const arbiterConfig = model.arbiterSideConfig()
  const arbiterValidation = model.arbiterValidation()
  const arbiterDefinition = model.arbiterDefinition()

  return (
    <section className={[styles.panel, styles.arbiterPanel].join(' ')}>
      <div>
        <p className={styles.eyebrow}>Optional role</p>
        <h2 className={styles.sideTitle}>Arbiter</h2>
        <p className={styles.summary}>
          Evaluates each applied move, powers the eval bar, and adds live commentary without affecting turn flow.
        </p>
      </div>

      <div className={styles.fieldGroup}>
        <label>
          <span>Provider</span>
          <select
            aria-label="Provider"
            value={arbiterConfig?.arbiterKey ?? 'none'}
            onChange={(event) => {
              const nextValue = event.target.value

              if (nextValue === 'none') {
                model.setArbiterProvider(null)
                return
              }

              if (isArbiterKey(nextValue)) {
                model.setArbiterProvider(nextValue as ArbiterProviderKey)
              }
            }}
          >
            <option value="none">None</option>
            {model.availableArbiters.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {arbiterConfig !== null && arbiterDefinition !== null ? (
        <div className={styles.customFields}>
          <ArbiterProviderSettings
            value={arbiterConfig}
            onChange={(next) => model.updateArbiterConfig(next)}
            errors={arbiterValidation.fieldErrors}
          />
        </div>
      ) : null}

      {arbiterValidation.error ? (
        <ul className={styles.errorList}>
          <li>{presentError(arbiterValidation.error)}</li>
        </ul>
      ) : null}
    </section>
  )
}, 'ArbiterCard')

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
          <div className={styles.resumeActions}>
            <SecondaryButton
              onClick={() => {
                model.resumeActiveMatch()
              }}
            >
              Resume Match
            </SecondaryButton>
            <SecondaryButton
              onClick={() => {
                model.openGames()
              }}
            >
              Open Archive
            </SecondaryButton>
          </div>
        </section>
      ) : null}

      <div className={styles.presetBar} role="group" aria-label="Quick presets">
        <span className={styles.presetBarLabel}>Presets</span>
        {PRESETS.map((preset) => (
          <Button
            key={`${preset.white}-${preset.black}`}
            className={styles.presetButton}
            onClick={() => model.setPreset(preset.white, preset.black)}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <div className={styles.grid}>
        <ActorCard side="white" model={model} />
        <div className={styles.swapColumn}>
          <Button
            className={styles.swapButton}
            onClick={() => model.swapSides()}
            title="Swap sides"
            aria-label="Swap white and black sides"
          >
            ⇄
          </Button>
        </div>
        <ActorCard side="black" model={model} />
      </div>

      <ArbiterCard model={model} />

      {setupError ? (
        <div className={styles.inlineError}>{presentError(setupError)}</div>
      ) : null}

      <div className={styles.actions}>
        <PrimaryButton
          disabled={!canStart}
          onClick={() => {
            void model.startMatch()
          }}
        >
          Start Match
        </PrimaryButton>
      </div>
    </div>
  )
}, 'MatchSetupPage')
