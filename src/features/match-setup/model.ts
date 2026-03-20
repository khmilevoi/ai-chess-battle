import { action, atom, computed } from '@reatom/core'
import { matchSessionConfig } from '../../app/model'
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
import { storedMatchConfig } from '../../shared/storage/matchConfigStorage'
import {
  readStoredActorConfig,
  saveStoredActorConfig,
} from '../../shared/storage/actorConfigStorage'
import {
  createStoredGameSession,
  loadStoredGameSession,
  saveStoredGameSession,
  summarizeStoredGameSession,
  type StoredGameSessionSummary,
} from '../../shared/storage/gameSessionStorage'

type CreateMatchSetupModelOptions = {
  name: string
  initialConfig: MatchConfig
  activeGameSummary: StoredGameSessionSummary | null
  startSession: (config: MatchConfig) => void
  goToGame: (config: MatchConfig) => void
  resumeMatch: (config: MatchConfig) => void
}

function hydrateSharedActorConfig<K extends ActorKey>(
  sideConfig: MatchSideConfig<K>,
): MatchSideConfig<K> {
  const storedConfig = readStoredActorConfig(sideConfig.actorKey)

  if (storedConfig === null) {
    return sideConfig
  }

  return {
    actorKey: sideConfig.actorKey,
    actorConfig: storedConfig,
  } as MatchSideConfig<K>
}

function syncSharedActorConfig<K extends ActorKey>(
  sideConfig: MatchSideConfig<K>,
): void {
  saveStoredActorConfig(sideConfig.actorKey, sideConfig.actorConfig)
}

export function createMatchSetupModel({
  name,
  initialConfig,
  activeGameSummary: initialActiveGameSummary,
  startSession,
  goToGame,
  resumeMatch,
}: CreateMatchSetupModelOptions) {
  const whiteSideConfig = atom<MatchSideConfig>(
    hydrateSharedActorConfig(initialConfig.white),
    `${name}.white`,
  )
  const blackSideConfig = atom<MatchSideConfig>(
    hydrateSharedActorConfig(initialConfig.black),
    `${name}.black`,
  )
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
  const activeGameSummary = computed(() => {
    const activeSessionConfig = matchSessionConfig()

    if (activeSessionConfig === null) {
      return initialActiveGameSummary
    }

    const storedGameSession = loadStoredGameSession()

    if (storedGameSession === null) {
      return null
    }

    const summary = summarizeStoredGameSession(storedGameSession)

    if (summary instanceof Error) {
      console.warn(summary)
      return null
    }

    return summary
  }, `${name}.activeGameSummary`)

  const setSideActor = action((side: Side, actorKey: ActorKey) => {
    const next = hydrateSharedActorConfig(createDefaultSideConfig(actorKey))

    if (side === 'white') {
      whiteSideConfig.set(next)

      if (blackSideConfig().actorKey === actorKey) {
        blackSideConfig.set(next)
      }

      return next
    }

    blackSideConfig.set(next)

    if (whiteSideConfig().actorKey === actorKey) {
      whiteSideConfig.set(next)
    }

    return next
  }, `${name}.setSideActor`)

  const updateSideConfig = action(
    (side: Side, nextConfig: MatchSideConfig) => {
      syncSharedActorConfig(nextConfig)

      if (side === 'white') {
        whiteSideConfig.set(nextConfig)

        if (blackSideConfig().actorKey === nextConfig.actorKey) {
          blackSideConfig.set(nextConfig)
        }

        return nextConfig
      }

      blackSideConfig.set(nextConfig)

      if (whiteSideConfig().actorKey === nextConfig.actorKey) {
        whiteSideConfig.set(nextConfig)
      }

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

    storedMatchConfig.set(matchConfig)

    syncSharedActorConfig(matchConfig.white)
    syncSharedActorConfig(matchConfig.black)

    saveStoredGameSession(
      createStoredGameSession({
        config: matchConfig,
      }),
    )

    startSession(matchConfig)
    goToGame(matchConfig)

    return null
  }, `${name}.startMatch`)

  const resumeActiveMatch = action(() => {
    const summary = activeGameSummary()

    if (summary === null) {
      return null
    }

    setupError.set(null)
    startSession(summary.config)
    resumeMatch(summary.config)
    return summary.config
  }, `${name}.resumeActiveMatch`)

  return {
    availableActors: listRegisteredActors(),
    activeGameSummary,
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
    resumeActiveMatch,
  }
}

export type MatchSetupModel = ReturnType<typeof createMatchSetupModel>
