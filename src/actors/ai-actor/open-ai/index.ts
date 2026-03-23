import { action, atom } from '@reatom/core'
import { z } from 'zod'
import type { AiActorSharedControls } from '..'
import { ActorConfigError } from '../../../shared/errors'
import { defineActor } from '../../types'
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_REASONING_EFFORT,
  openAiActorConfigSchema,
} from './config.schema'
import { OpenAiActorControls } from './controls'
import { OpenAiActorRuntime } from './model'
import { OpenAiActorSettings } from './ui'

export const openAiActorStoredControlsSchema = z.object({
  waitForConfirmation: z.boolean(),
})

export type OpenAiActorStoredControls = z.infer<
  typeof openAiActorStoredControlsSchema
>

function createOpenAiRuntimeControls({
  name,
  initialState,
  persist,
}: {
  name: string
  initialState: OpenAiActorStoredControls
  persist: (nextState: OpenAiActorStoredControls) => void
}): AiActorSharedControls {
  const waitForConfirmation = atom(
    initialState.waitForConfirmation,
    `${name}.waitForConfirmation`,
  )
  const setWaitForConfirmationValue = action((next: boolean) => {
    waitForConfirmation.set(next)
    persist({ waitForConfirmation: next })
    return null
  }, `${name}.setWaitForConfirmationValue`)

  return {
    waitForConfirmation,
    setWaitForConfirmationValue,
  }
}

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
  ControlsComponent: OpenAiActorControls,
  controlsContract: {
    storageSchema: openAiActorStoredControlsSchema,
    createDefaultStoredState: (): OpenAiActorStoredControls => ({
      waitForConfirmation: false,
    }),
    getControlGroupKey: (_config) => 'openai',
    createRuntimeControls: createOpenAiRuntimeControls,
  },
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
