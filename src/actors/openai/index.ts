import { ActorConfigError } from '../../shared/errors'
import { defineActor } from '../types'
import {
  DEFAULT_OPENAI_MODEL,
  openAiActorConfigSchema,
} from './config.schema'
import { OpenAiActorRuntime } from './model'
import { OpenAiActorSettings } from './ui'

export const OpenAiActor = defineActor({
  key: 'openai',
  displayName: 'OpenAI Actor',
  summary: 'Requests moves from the Responses API.',
  configSchema: openAiActorConfigSchema,
  createDefaultConfig: () => ({
    apiKey: '',
    model: DEFAULT_OPENAI_MODEL,
  }),
  SettingsComponent: OpenAiActorSettings,
  create(config) {
    const validation = openAiActorConfigSchema.safeParse(config)

    if (!validation.success) {
      return new ActorConfigError({
        side: 'unknown',
        actorKey: 'openai',
        cause: validation.error,
      })
    }

    return new OpenAiActorRuntime(validation.data)
  },
})

export { DEFAULT_OPENAI_MODEL } from './config.schema'
export type { OpenAiActorConfig } from './config.schema'
