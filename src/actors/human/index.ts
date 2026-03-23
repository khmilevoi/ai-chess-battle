import { ActorConfigError } from '@/shared/errors'
import { defineActor } from '../types'
import {
  humanActorConfigSchema,
} from './config.schema'
import { HumanActorRuntime } from './model'
import { HumanActorMatchInfo, HumanActorSettings } from './ui'

export const HumanActor = defineActor({
  key: 'human',
  displayName: 'Human Actor',
  summary: 'Moves are selected directly on the board.',
  configSchema: humanActorConfigSchema,
  createDefaultConfig: () => ({}),
  SettingsComponent: HumanActorSettings,
  MatchInfoComponent: HumanActorMatchInfo,
  create(config) {
    const validation = humanActorConfigSchema.safeParse(config)

    if (!validation.success) {
      return new ActorConfigError({
        side: 'unknown',
        actorKey: 'human',
        cause: validation.error,
      })
    }

    return new HumanActorRuntime()
  },
})

export type { HumanActorConfig } from './config.schema'
