import { ActorConfigError } from '../../shared/errors'
import { defineActor } from '../types'
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_REASONING_EFFORT,
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
    reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
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
export {
  DEFAULT_OPENAI_REASONING_EFFORT,
  OPENAI_MODEL_OPTIONS,
  OPENAI_REASONING_OPTIONS,
} from './config.schema'
export type {
  OpenAiActorConfig,
  OpenAiModelOption,
  OpenAiReasoningEffort,
  OpenAiReasoningOption,
} from './config.schema'
