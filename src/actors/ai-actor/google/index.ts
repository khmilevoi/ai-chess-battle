import { ActorConfigError } from '@/shared/errors'
import { defineActor } from '../../types'
import {
  aiActorStoredControlsSchema,
  createAiActorControlsContract,
  type AiActorStoredControls,
} from '../runtimeControls'
import { DEFAULT_GOOGLE_MODEL, googleActorConfigSchema } from './config.schema'
import { GoogleActorControls } from './controls'
import { GoogleActorRuntime } from './model'
import { GoogleActorMatchInfo, GoogleActorSettings } from './ui'
import type { AiActorSharedControls } from '..'

export const googleActorStoredControlsSchema = aiActorStoredControlsSchema
export type GoogleActorStoredControls = AiActorStoredControls

export const GoogleActor = defineActor({
  key: 'google',
  displayName: 'Gemini Actor',
  summary: 'Requests moves from the Gemini API.',
  configSchema: googleActorConfigSchema,
  createDefaultConfig: () => ({
    apiKey: '',
    model: DEFAULT_GOOGLE_MODEL,
  }),
  SettingsComponent: GoogleActorSettings,
  MatchInfoComponent: GoogleActorMatchInfo,
  ControlsComponent: GoogleActorControls,
  controlsContract: createAiActorControlsContract({
    controlGroupKey: 'google',
  }),
  create(config, options) {
    const validation = googleActorConfigSchema.safeParse(config)

    if (!validation.success) {
      return new ActorConfigError({
        side: 'unknown',
        actorKey: 'google',
        cause: validation.error,
      })
    }

    return new GoogleActorRuntime(
      validation.data,
      undefined,
      options?.runtimeControls as AiActorSharedControls | undefined,
    )
  },
})

export { DEFAULT_GOOGLE_MODEL, GOOGLE_MODEL_OPTIONS } from './config.schema'
export type { GoogleActorConfig, GoogleModelOption } from './config.schema'
export { GoogleActorRuntime } from './model'
