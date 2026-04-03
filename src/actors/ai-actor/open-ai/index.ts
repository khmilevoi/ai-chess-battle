import type { AiActorSharedControls } from '..'
import { ActorConfigError } from '@/shared/errors'
import { defineActor } from '../../types'
import {
  aiActorStoredControlsSchema,
  createAiActorControlsContract,
  type AiActorStoredControls,
} from '../runtimeControls'
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_REASONING_EFFORT,
  openAiActorConfigSchema,
} from './config.schema'
import { OpenAiActorControls } from './controls'
import { OpenAiActorRuntime } from './model'
import { OpenAiActorMatchInfo, OpenAiActorSettings } from './ui'

export const openAiActorStoredControlsSchema = aiActorStoredControlsSchema
export type OpenAiActorStoredControls = AiActorStoredControls

export const OpenAiActor = defineActor({
  key: 'openai',
  displayName: 'OpenAI Actor',
  summary: 'Requests moves from the Responses API.',
  configSchema: openAiActorConfigSchema,
  secretField: 'apiKey',
  createDefaultConfig: () => ({
    apiKey: '',
    model: DEFAULT_OPENAI_MODEL,
    reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
  }),
  SettingsComponent: OpenAiActorSettings,
  MatchInfoComponent: OpenAiActorMatchInfo,
  ControlsComponent: OpenAiActorControls,
  controlsContract: createAiActorControlsContract({
    controlGroupKey: 'openai',
  }),
  create(config, options) {
    const validation = openAiActorConfigSchema.safeParse(config)

    if (!validation.success) {
      return new ActorConfigError({
        side: 'unknown',
        actorKey: 'openai',
        cause: validation.error,
      })
    }

    return new OpenAiActorRuntime(
      validation.data,
      undefined,
      options?.runtimeControls as AiActorSharedControls | undefined,
    )
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
export { OpenAiActorRuntime } from './model'
