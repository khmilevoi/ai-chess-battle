import { ActorConfigError } from '@/shared/errors'
import { defineActor } from '../../types'
import {
  aiActorStoredControlsSchema,
  createAiActorControlsContract,
  type AiActorStoredControls,
} from '../runtimeControls'
import {
  anthropicActorConfigSchema,
  DEFAULT_ANTHROPIC_EFFORT,
  DEFAULT_ANTHROPIC_MODEL,
} from './config.schema'
import { AnthropicActorControls } from './controls'
import { AnthropicActorRuntime } from './model'
import { AnthropicActorMatchInfo, AnthropicActorSettings } from './ui'
import type { AiActorSharedControls } from '..'

export const anthropicActorStoredControlsSchema = aiActorStoredControlsSchema
export type AnthropicActorStoredControls = AiActorStoredControls

export const AnthropicActor = defineActor({
  key: 'anthropic',
  displayName: 'Anthropic Actor',
  summary: 'Requests moves from the Claude Messages API.',
  configSchema: anthropicActorConfigSchema,
  secretField: 'apiKey',
  createDefaultConfig: () => ({
    apiKey: '',
    effort: DEFAULT_ANTHROPIC_EFFORT,
    model: DEFAULT_ANTHROPIC_MODEL,
  }),
  SettingsComponent: AnthropicActorSettings,
  MatchInfoComponent: AnthropicActorMatchInfo,
  ControlsComponent: AnthropicActorControls,
  controlsContract: createAiActorControlsContract({
    controlGroupKey: 'anthropic',
  }),
  create(config, options) {
    const validation = anthropicActorConfigSchema.safeParse(config)

    if (!validation.success) {
      return new ActorConfigError({
        side: 'unknown',
        actorKey: 'anthropic',
        cause: validation.error,
      })
    }

    return new AnthropicActorRuntime(
      validation.data,
      undefined,
      options?.runtimeControls as AiActorSharedControls | undefined,
    )
  },
})

export {
  ANTHROPIC_EFFORT_OPTIONS,
  ANTHROPIC_MODEL_OPTIONS,
  DEFAULT_ANTHROPIC_EFFORT,
  DEFAULT_ANTHROPIC_MODEL,
  getAnthropicEffortOptions,
  getAnthropicModelOption,
  normalizeAnthropicEffort,
} from './config.schema'
export type {
  AnthropicActorConfig,
  AnthropicEffort,
  AnthropicEffortOption,
  AnthropicModelOption,
} from './config.schema'
export { AnthropicActorRuntime } from './model'
