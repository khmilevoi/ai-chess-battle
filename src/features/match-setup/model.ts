import { action, atom, computed, peek } from '@reatom/core'
import {
  createDefaultArbiterConfig,
  getRegisteredArbiter,
  listRegisteredArbiters,
  validateArbiterSideConfig,
  type ArbiterProviderKey,
} from '@/arbiter/registry'
import type { ArbiterSideConfig } from '@/arbiter/types'
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
  readStoredArbiterConfig,
  saveStoredArbiterConfig,
} from '@/shared/storage/arbiterConfigStorage'
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
  type StoredArbiterSideConfig,
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

function hydrateSharedArbiterConfig(
  arbiterConfig: ArbiterSideConfig | null | undefined,
): StoredArbiterSideConfig | null {
  if (arbiterConfig === null || arbiterConfig === undefined) {
    return null
  }

  const storedConfig = readStoredArbiterConfig(arbiterConfig.arbiterKey)

  if (storedConfig === null) {
    return arbiterConfig
  }

  return {
    arbiterKey: arbiterConfig.arbiterKey,
    arbiterConfig: storedConfig,
  } satisfies StoredArbiterSideConfig
}

function syncSharedArbiterConfig(sideConfig: ArbiterSideConfig | null): void {
  if (sideConfig === null) {
    return
  }

  saveStoredArbiterConfig(sideConfig.arbiterKey, sideConfig.arbiterConfig as never)
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
  const arbiterSideConfigState = atom<StoredArbiterSideConfig | null>(
    hydrateSharedArbiterConfig(initialConfig.arbiter),
    `${name}.arbiterState`,
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
  const arbiterSideConfig = computed(
    () => arbiterSideConfigState(),
    `${name}.arbiter`,
  )

  const whiteValidation = computed(
    () => validateSideConfig('white', whiteSideConfig()),
    `${name}.whiteValidation`,
  )
  const blackValidation = computed(
    () => validateSideConfig('black', blackSideConfig()),
    `${name}.blackValidation`,
  )
  const arbiterValidation = computed(() => {
    const currentArbiter = arbiterSideConfig()
    const validation = validateArbiterSideConfig(currentArbiter)

    if (currentArbiter === null) {
      return validation
    }

    const descriptor = getRegisteredArbiter(currentArbiter.arbiterKey)
    const hasSecret =
      (vaultSecretsAtom()[currentArbiter.arbiterKey] ?? '').length > 0

    if (!hasSecret) {
      return {
        config: null,
        error: new Error(`Enter an API key for ${descriptor.displayName} in the vault.`),
        fieldErrors: {
          ...validation.fieldErrors,
          apiKey: ['API key is required'],
        },
      }
    }

    return validation
  }, `${name}.arbiterValidation`)
  const readyConfig = computed(() => {
    const white = whiteValidation()
    const black = blackValidation()
    const arbiter = arbiterValidation()

    if (!white.config || !black.config || arbiter.error) {
      return null
    }

    return {
      white: white.config,
      black: black.config,
      arbiter: arbiter.config,
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
  const arbiterDefinition = computed(() => {
    const currentArbiter = arbiterSideConfig()
    return currentArbiter === null
      ? null
      : getRegisteredArbiter(currentArbiter.arbiterKey)
  }, `${name}.arbiterDefinition`)
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

  const setArbiterProvider = action((arbiterKey: ArbiterProviderKey | null) => {
    if (arbiterKey === null) {
      arbiterSideConfigState.set(null)
      return null
    }

    const storedConfig = readStoredArbiterConfig(arbiterKey)
    arbiterSideConfigState.set(
      storedConfig === null
        ? createDefaultArbiterConfig(arbiterKey)
        : {
            arbiterKey,
            arbiterConfig: storedConfig,
          },
    )

    return null
  }, `${name}.setArbiterProvider`)

  const updateArbiterConfig = action((nextConfig: ArbiterSideConfig | null) => {
    syncSharedArbiterConfig(nextConfig)
    arbiterSideConfigState.set(nextConfig)
    return nextConfig
  }, `${name}.updateArbiterConfig`)

  const startMatch = action(async () => {
    setupError.set(null)

    const white = whiteValidation()
    const black = blackValidation()
    const arbiter = arbiterValidation()

    if (white.error) {
      setupError.set(white.error)
      return white.error
    }

    if (black.error) {
      setupError.set(black.error)
      return black.error
    }

    if (arbiter.error) {
      setupError.set(arbiter.error)
      return arbiter.error
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
    syncSharedArbiterConfig(matchConfig.arbiter ?? null)

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

  const swapSides = action(() => {
    const white = peek(whiteSideConfigState)
    const black = peek(blackSideConfigState)
    whiteSideConfigState.set(black)
    blackSideConfigState.set(white)
    return null
  }, `${name}.swapSides`)

  const setPreset = action((whiteActorKey: ActorKey, blackActorKey: ActorKey) => {
    const newWhite = hydrateSharedActorConfig(createDefaultSideConfig(whiteActorKey))
    const newBlack = hydrateSharedActorConfig(createDefaultSideConfig(blackActorKey))
    whiteSideConfigState.set(newWhite)
    blackSideConfigState.set(newBlack)
    return null
  }, `${name}.setPreset`)

  const openGames = action(() => {
    goToGames()
    return null
  }, `${name}.openGames`)

  return {
    availableActors: listRegisteredActors(),
    availableArbiters: listRegisteredArbiters(),
    activeGameSummary,
    whiteSideConfig,
    blackSideConfig,
    arbiterSideConfig,
    whiteValidation,
    blackValidation,
    arbiterValidation,
    whiteActorDefinition,
    blackActorDefinition,
    arbiterDefinition,
    readyConfig,
    canStart,
    setupError,
    setSideActor,
    updateSideConfig,
    setArbiterProvider,
    updateArbiterConfig,
    startMatch,
    resumeActiveMatch,
    openGames,
    swapSides,
    setPreset,
  }
}

export type MatchSetupModel = ReturnType<typeof createMatchSetupModel>
