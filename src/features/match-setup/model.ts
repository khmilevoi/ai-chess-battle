import { action, atom, computed, peek } from '@reatom/core'
import { ActorError } from '@/shared/errors'
import {
  createDefaultSideConfig,
  getRegisteredActor,
  listRegisteredActors,
  validateSideConfig,
  type ActorKey,
  type MatchConfig,
  type MatchSideConfig,
} from '@/actors/registry'
import type { Side } from '@/domain/chess/types'
import { storedMatchConfig } from '@/shared/storage/matchConfigStorage'
import {
  readStoredActorConfig,
  saveStoredActorConfig,
} from '@/shared/storage/actorConfigStorage'
import { vaultSecretsAtom } from '@/shared/storage/credentialVault'
import {
  activeStoredGameSummaryAtom,
  createStoredGame,
} from '@/shared/storage/gameSessionStorage'
import {
  redactSideConfig,
  resolveStoredSideConfig,
  type StoredSideConfig,
} from '@/shared/storage/helpers'

type CreateMatchSetupModelOptions = {
  name: string
  initialConfig: MatchConfig
  goToGame: (gameId: string) => void
  goToGames: () => void
}

function hydrateSharedActorConfig<K extends ActorKey>(
  sideConfig: MatchSideConfig<K>,
): StoredSideConfig<K> {
  const storedConfig = readStoredActorConfig(sideConfig.actorKey)

  if (storedConfig === null) {
    return redactSideConfig(sideConfig)
  }

  return redactSideConfig({
    actorKey: sideConfig.actorKey,
    actorConfig: storedConfig,
  } as MatchSideConfig<K>)
}

function syncSharedActorConfig<K extends ActorKey>(
  sideConfig: MatchSideConfig<K>,
): void {
  saveStoredActorConfig(sideConfig.actorKey, sideConfig.actorConfig)
}

export function createMatchSetupModel({
  name,
  initialConfig,
  goToGame,
  goToGames,
}: CreateMatchSetupModelOptions) {
  const whiteSideConfigState = atom<StoredSideConfig>(
    hydrateSharedActorConfig(initialConfig.white),
    `${name}.whiteState`,
  )
  const blackSideConfigState = atom<StoredSideConfig>(
    hydrateSharedActorConfig(initialConfig.black),
    `${name}.blackState`,
  )
  const setupError = atom<Error | null>(null, `${name}.setupError`)
  const whiteSideConfig = computed(
    () => resolveStoredSideConfig(whiteSideConfigState(), vaultSecretsAtom()),
    `${name}.white`,
  )
  const blackSideConfig = computed(
    () => resolveStoredSideConfig(blackSideConfigState(), vaultSecretsAtom()),
    `${name}.black`,
  )

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
  const canStart = computed(() => readyConfig() !== null, `${name}.canStart`)
  const whiteActorDefinition = computed(
    () => getRegisteredActor(whiteSideConfig().actorKey),
    `${name}.whiteActorDefinition`,
  )
  const blackActorDefinition = computed(
    () => getRegisteredActor(blackSideConfig().actorKey),
    `${name}.blackActorDefinition`,
  )
  const activeGameSummary = computed(
    () => activeStoredGameSummaryAtom(),
    `${name}.activeGameSummary`,
  )

  const setSideActor = action((side: Side, actorKey: ActorKey) => {
    const next = hydrateSharedActorConfig(createDefaultSideConfig(actorKey))

    if (side === 'white') {
      whiteSideConfigState.set(next)

      if (blackSideConfigState().actorKey === actorKey) {
        blackSideConfigState.set(next)
      }

      return resolveStoredSideConfig(next, peek(vaultSecretsAtom))
    }

    blackSideConfigState.set(next)

    if (whiteSideConfigState().actorKey === actorKey) {
      whiteSideConfigState.set(next)
    }

    return resolveStoredSideConfig(next, peek(vaultSecretsAtom))
  }, `${name}.setSideActor`)

  const updateSideConfig = action(
    (side: Side, nextConfig: MatchSideConfig) => {
      syncSharedActorConfig(nextConfig)
      const nextStoredConfig = redactSideConfig(nextConfig)

      if (side === 'white') {
        whiteSideConfigState.set(nextStoredConfig)

        if (blackSideConfigState().actorKey === nextConfig.actorKey) {
          blackSideConfigState.set(nextStoredConfig)
        }

        return nextConfig
      }

      blackSideConfigState.set(nextStoredConfig)

      if (whiteSideConfigState().actorKey === nextConfig.actorKey) {
        whiteSideConfigState.set(nextStoredConfig)
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

    storedMatchConfig.save(matchConfig)

    syncSharedActorConfig(matchConfig.white)
    syncSharedActorConfig(matchConfig.black)

    const game = createStoredGame({
      config: matchConfig,
      makeActive: true,
    })

    if (game instanceof Error) {
      setupError.set(game)
      return game
    }

    goToGame(game.id)

    return null
  }, `${name}.startMatch`)

  const resumeActiveMatch = action(() => {
    const summary = activeGameSummary()

    if (summary === null) {
      return null
    }

    setupError.set(null)
    goToGame(summary.id)
    return summary.id
  }, `${name}.resumeActiveMatch`)

  const openGames = action(() => {
    goToGames()
    return null
  }, `${name}.openGames`)

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
    openGames,
  }
}

export type MatchSetupModel = ReturnType<typeof createMatchSetupModel>
