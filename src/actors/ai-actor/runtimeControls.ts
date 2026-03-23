import { action, atom } from '@reatom/core'
import { z } from 'zod'
import type { ActorControlsContract } from '../types'
import type { AiActorSharedControls } from '.'

export const aiActorStoredControlsSchema = z.object({
  waitForConfirmation: z.boolean(),
})

export type AiActorStoredControls = z.infer<typeof aiActorStoredControlsSchema>

function createAiActorRuntimeControls({
  name,
  initialState,
  persist,
}: {
  name: string
  initialState: AiActorStoredControls
  persist: (nextState: AiActorStoredControls) => void
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

export function createAiActorControlsContract<Config>({
  controlGroupKey,
}: {
  controlGroupKey: string
}): ActorControlsContract<Config, AiActorStoredControls, AiActorSharedControls> {
  return {
    storageSchema: aiActorStoredControlsSchema,
    createDefaultStoredState: (): AiActorStoredControls => ({
      waitForConfirmation: false,
    }),
    getControlGroupKey: (_config: Config) => controlGroupKey,
    createRuntimeControls: createAiActorRuntimeControls,
  }
}
