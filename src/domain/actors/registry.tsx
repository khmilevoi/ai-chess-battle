import type { ReactNode } from 'react'
import { z } from 'zod'
import { ActorConfigError } from '../../shared/errors'
import type { Side } from '../chess/types'
import { HumanActor } from './humanActor'
import {
  DEFAULT_OPENAI_MODEL,
  OpenAiActor,
  openAiActorConfigSchema,
  type OpenAiActorConfig,
} from './openAiActor'
import {
  actorKeys,
  emptyObjectSchema,
  type ActorKey,
  type ActorSettingsComponentProps,
  type AnyRegisteredActor,
  type MatchConfig,
  type MatchSideConfig,
  type SideValidation,
} from './types'

type HumanActorConfig = Record<string, never>

function FieldErrorList({
  errors,
}: {
  errors: Array<string> | undefined
}): ReactNode {
  if (!errors || errors.length === 0) {
    return null
  }

  return (
    <ul>
      {errors.map((error) => (
        <li key={error}>{error}</li>
      ))}
    </ul>
  )
}

function HumanSettings({
  side,
}: ActorSettingsComponentProps<HumanActorConfig>) {
  return (
    <div>
      <p>{side === 'white' ? 'White' : 'Black'} will wait for board input.</p>
    </div>
  )
}

function OpenAiSettings({
  value,
  onChange,
  errors,
}: ActorSettingsComponentProps<OpenAiActorConfig>) {
  return (
    <div>
      <label>
        <span>API key</span>
        <input
          type="password"
          value={value.apiKey}
          onChange={(event) =>
            onChange({
              ...value,
              apiKey: event.target.value,
            })
          }
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <FieldErrorList errors={errors.apiKey} />
      <label>
        <span>Model</span>
        <input
          type="text"
          value={value.model}
          onChange={(event) =>
            onChange({
              ...value,
              model: event.target.value,
            })
          }
          spellCheck={false}
        />
      </label>
      <FieldErrorList errors={errors.model} />
    </div>
  )
}

const registry: Record<ActorKey, AnyRegisteredActor> = {
  human: {
    key: 'human',
    displayName: 'Human Actor',
    summary: 'Moves are selected directly on the board.',
    configSchema: emptyObjectSchema,
    createDefaultConfig: () => ({}),
    SettingsComponent: HumanSettings,
    create(config) {
      const validation = emptyObjectSchema.safeParse(config)

      if (!validation.success) {
        return new ActorConfigError({
          side: 'unknown',
          actorKey: 'human',
          cause: validation.error,
        })
      }

      return new HumanActor()
    },
  },
  openai: {
    key: 'openai',
    displayName: 'OpenAI Actor',
    summary: 'Requests moves from the Responses API.',
    configSchema: openAiActorConfigSchema,
    createDefaultConfig: () => ({
      apiKey: '',
      model: DEFAULT_OPENAI_MODEL,
    }),
    SettingsComponent: OpenAiSettings,
    create(config) {
      const validation = openAiActorConfigSchema.safeParse(config)

      if (!validation.success) {
        return new ActorConfigError({
          side: 'unknown',
          actorKey: 'openai',
          cause: validation.error,
        })
      }

      return new OpenAiActor(validation.data)
    },
  },
}

function normalizeFieldErrors(
  fieldErrors: Record<string, Array<string> | undefined>,
): Record<string, Array<string>> {
  return Object.fromEntries(
    Object.entries(fieldErrors).map(([key, value]) => [key, value ?? []]),
  )
}

export function getRegisteredActor(actorKey: ActorKey): AnyRegisteredActor {
  return registry[actorKey]
}

export function listRegisteredActors(): Array<AnyRegisteredActor> {
  return actorKeys.map((key) => registry[key])
}

export function createDefaultSideConfig(actorKey: ActorKey = 'human'): MatchSideConfig {
  const actor = getRegisteredActor(actorKey)

  return {
    actorKey: actor.key,
    actorConfig: actor.createDefaultConfig(),
  }
}

export function createDefaultMatchConfig(): MatchConfig {
  return {
    white: createDefaultSideConfig('human'),
    black: createDefaultSideConfig('human'),
  }
}

export function validateSideConfig(
  side: Side,
  config: MatchSideConfig,
): SideValidation {
  const actor = getRegisteredActor(config.actorKey)
  const validation = actor.configSchema.safeParse(config.actorConfig)

  if (!validation.success) {
    return {
      config: null,
      error: new ActorConfigError({
        side,
        actorKey: config.actorKey,
        cause: validation.error,
      }),
      fieldErrors: normalizeFieldErrors(validation.error.flatten().fieldErrors),
    }
  }

  return {
    config: {
      actorKey: config.actorKey,
      actorConfig: validation.data,
    },
    error: null,
    fieldErrors: {},
  }
}

export const matchSideDraftSchema = z.object({
  actorKey: z.enum(actorKeys),
  actorConfig: z.unknown(),
})
