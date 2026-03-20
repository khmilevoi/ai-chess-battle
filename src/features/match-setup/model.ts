import { action, atom, computed } from '@reatom/core'
import { ActorError } from '../../shared/errors'
import {
  createDefaultSideConfig,
  getRegisteredActor,
  listRegisteredActors,
  validateSideConfig,
  type ActorKey,
  type MatchConfig,
  type MatchSideConfig,
} from '../../actors/registry'
import type { Side } from '../../domain/chess/types'
import { saveStoredMatchConfig } from '../../shared/storage/matchConfigStorage'

type CreateMatchSetupModelOptions = {
  name: string
  initialConfig: MatchConfig
  startSession: (config: MatchConfig) => void
  goToGame: (config: MatchConfig) => void
}

export function createMatchSetupModel({
  name,
  initialConfig,
  startSession,
  goToGame,
}: CreateMatchSetupModelOptions) {
  const whiteSideConfig = atom<MatchSideConfig>(initialConfig.white, `${name}.white`)
  const blackSideConfig = atom<MatchSideConfig>(initialConfig.black, `${name}.black`)
  const setupError = atom<Error | null>(null, `${name}.setupError`)

  const whiteValidation = computed(
    () => validateSideConfig('white', whiteSideConfig()),
    `${name}.whiteValidation`,
  )
  const blackValidation = computed(
    () => validateSideConfig('black', blackSideConfig()),
    `${name}.blackValidation`,
  )
  const readyConfig = computed(() => {
    const white = whiteValidation()
    const black = blackValidation()

    if (!white.config || !black.config) {
      return null
    }

    return {
      white: white.config,
      black: black.config,
    } satisfies MatchConfig
  }, `${name}.readyConfig`)
  const canStart = computed(
    () => readyConfig() !== null,
    `${name}.canStart`,
  )
  const whiteActorDefinition = computed(
    () => getRegisteredActor(whiteSideConfig().actorKey),
    `${name}.whiteActorDefinition`,
  )
  const blackActorDefinition = computed(
    () => getRegisteredActor(blackSideConfig().actorKey),
    `${name}.blackActorDefinition`,
  )

  const setSideActor = action((side: Side, actorKey: ActorKey) => {
    const next = createDefaultSideConfig(actorKey)

    if (side === 'white') {
      whiteSideConfig.set(next)
      return next
    }

    blackSideConfig.set(next)
    return next
  }, `${name}.setSideActor`)

  const updateSideConfig = action(
    (side: Side, nextConfig: MatchSideConfig) => {
      if (side === 'white') {
        whiteSideConfig.set(nextConfig)
        return nextConfig
      }

      blackSideConfig.set(nextConfig)
      return nextConfig
    },
    `${name}.updateSideConfig`,
  )

  const startMatch = action(async () => {
    setupError.set(null)

    const white = whiteValidation()
    const black = blackValidation()

    if (white.error) {
      setupError.set(white.error)
      return white.error
    }

    if (black.error) {
      setupError.set(black.error)
      return black.error
    }

    const matchConfig = readyConfig()

    if (!matchConfig) {
      const error = new ActorError({
        message: 'Match configuration is incomplete.',
      })
      setupError.set(error)
      return error
    }

    const storageResult = saveStoredMatchConfig(matchConfig)

    if (storageResult instanceof Error) {
      console.warn(storageResult)
    }

    startSession(matchConfig)
    goToGame(matchConfig)

    return null
  }, `${name}.startMatch`)

  return {
    availableActors: listRegisteredActors(),
    whiteSideConfig,
    blackSideConfig,
    whiteValidation,
    blackValidation,
    whiteActorDefinition,
    blackActorDefinition,
    readyConfig,
    canStart,
    setupError,
    setSideActor,
    updateSideConfig,
    startMatch,
  }
}

export type MatchSetupModel = ReturnType<typeof createMatchSetupModel>
