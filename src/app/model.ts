import * as errore from 'errore'
import { action, atom, computed, reatomEnum, wrap } from '@reatom/core'
import { HumanActor } from '../domain/actors/humanActor'
import {
  createDefaultSideConfig,
  getRegisteredActor,
  listRegisteredActors,
  validateSideConfig,
} from '../domain/actors/registry'
import type {
  ActorKey,
  MatchConfig,
  MatchSideConfig,
} from '../domain/actors/types'
import { createChessEngine } from '../domain/chess/createChessEngine'
import {
  isTerminalStatus,
  toUciMove,
  type ActorContext,
  type ActorMove,
  type BoardSnapshot,
  type ChessEngineFacade,
  type GameActor,
  type Side,
  type Square,
} from '../domain/chess/types'
import { ActorError, TurnCancelledError } from '../shared/errors'
import {
  fallbackMatchConfig,
  loadStoredMatchConfig,
  saveStoredMatchConfig,
} from '../shared/storage/matchConfigStorage'

type SideActors = Record<
  Side,
  {
    actorKey: ActorKey
    actor: GameActor
  }
>

type AppModel = ReturnType<typeof createAppModel>

function buildActorContext(
  engine: ChessEngineFacade,
  snapshot: BoardSnapshot,
): ActorContext {
  const legalMovesBySquare: Record<Square, Array<Square>> = {}

  for (const square of engine.getMovablePieces(snapshot.turn)) {
    legalMovesBySquare[square] = engine.getLegalMoves(square)
  }

  return {
    side: snapshot.turn,
    snapshot,
    legalMovesBySquare,
    moveCount: snapshot.history.length,
  }
}

function getPromotion(
  snapshot: BoardSnapshot,
  from: Square,
  to: Square,
): ActorMove['promotion'] {
  const piece = snapshot.pieces.find((candidate) => candidate.square === from)

  if (!piece || piece.type !== 'pawn') {
    return undefined
  }

  const targetRank = to.at(-1)

  if (
    (piece.side === 'white' && targetRank === '8') ||
    (piece.side === 'black' && targetRank === '1')
  ) {
    return 'q'
  }

  return undefined
}

function createSideActors(config: MatchConfig): SideActors | Error {
  const sides: SideActors = {
    white: {
      actorKey: config.white.actorKey,
      actor: undefined as unknown as GameActor,
    },
    black: {
      actorKey: config.black.actorKey,
      actor: undefined as unknown as GameActor,
    },
  }

  for (const side of ['white', 'black'] as const) {
    const sideConfig = config[side]
    const actor = getRegisteredActor(sideConfig.actorKey).create(sideConfig.actorConfig)

    if (actor instanceof Error) {
      return actor
    }

    sides[side] = {
      actorKey: sideConfig.actorKey,
      actor,
    }
  }

  return sides
}

export function createAppModel(name: string) {
  const loadedConfig = loadStoredMatchConfig()
  const initialConfig =
    loadedConfig instanceof Error || loadedConfig === null
      ? fallbackMatchConfig()
      : loadedConfig

  if (loadedConfig instanceof Error) {
    console.warn(loadedConfig)
  }

  const whiteSideConfig = atom<MatchSideConfig>(initialConfig.white, `${name}.white`)
  const blackSideConfig = atom<MatchSideConfig>(initialConfig.black, `${name}.black`)
  const engine = atom<ChessEngineFacade | null>(null, `${name}.engine`)
  const snapshot = atom<BoardSnapshot | null>(null, `${name}.snapshot`)
  const actors = atom<SideActors | null>(null, `${name}.actors`)
  const selectedSquare = atom<Square | null>(null, `${name}.selectedSquare`)
  const setupError = atom<Error | null>(
    loadedConfig instanceof Error ? loadedConfig : null,
    `${name}.setupError`,
  )
  const runtimeError = atom<Error | null>(null, `${name}.runtimeError`)
  const activeController = atom<AbortController | null>(null, `${name}.controller`)
  const phase = reatomEnum(['setup', 'playing', 'actorError', 'gameOver'], {
    name: `${name}.phase`,
    initState: 'setup',
  })

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
  const movableSquares = computed(() => {
    const currentEngine = engine()
    const currentSnapshot = snapshot()

    if (!currentEngine || !currentSnapshot) {
      return [] as Array<Square>
    }

    return currentEngine.getMovablePieces(currentSnapshot.turn)
  }, `${name}.movableSquares`)
  const selectedLegalMoves = computed(() => {
    const currentEngine = engine()
    const square = selectedSquare()

    if (!currentEngine || square === null) {
      return [] as Array<Square>
    }

    return currentEngine.getLegalMoves(square)
  }, `${name}.selectedLegalMoves`)
  const activeHumanActor = computed(() => {
    const currentSnapshot = snapshot()
    const currentActors = actors()

    if (!currentSnapshot || !currentActors) {
      return null
    }

    const actor = currentActors[currentSnapshot.turn]?.actor
    return actor instanceof HumanActor ? actor : null
  }, `${name}.activeHumanActor`)

  const resetMatch = action(() => {
    const currentController = activeController()
    const currentSnapshot = snapshot()

    if (currentController) {
      currentController.abort(
        new TurnCancelledError({
          side: currentSnapshot?.turn ?? 'white',
        }),
      )
    }

    activeController.set(null)
    engine.set(null)
    actors.set(null)
    snapshot.set(null)
    selectedSquare.set(null)
    runtimeError.set(null)
    phase.setSetup()
  }, `${name}.resetMatch`)

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
    (side: Side, actorConfig: MatchSideConfig['actorConfig']) => {
      if (side === 'white') {
        whiteSideConfig.set((state) => ({ ...state, actorConfig }))
        return actorConfig
      }

      blackSideConfig.set((state) => ({ ...state, actorConfig }))
      return actorConfig
    },
    `${name}.updateSideConfig`,
  )

  const playTurn = action(async () => {
    while (true) {
      const currentEngine = engine()
      const currentActors = actors()
      const currentSnapshot = snapshot()

      if (!currentEngine || !currentActors || !currentSnapshot) {
        return null
      }

      if (isTerminalStatus(currentSnapshot.status)) {
        phase.setGameOver()
        return currentSnapshot
      }

      phase.setPlaying()
      runtimeError.set(null)

      const controller = new AbortController()
      activeController.set(controller)

      const actorContext = buildActorContext(currentEngine, currentSnapshot)
      const result = await wrap(
        currentActors[currentSnapshot.turn].actor.requestMove({
          context: actorContext,
          signal: controller.signal,
        }),
      )

      if (activeController() !== controller) {
        return null
      }

      activeController.set(null)

      if (errore.isAbortError(result)) {
        return result
      }

      if (result instanceof Error) {
        runtimeError.set(result)
        phase.setActorError()
        return result
      }

      const nextSnapshot = currentEngine.applyMove(result)

      if (nextSnapshot instanceof Error) {
        runtimeError.set(nextSnapshot)
        phase.setActorError()
        return nextSnapshot
      }

      snapshot.set(nextSnapshot)
      selectedSquare.set(null)
      runtimeError.set(null)

      if (isTerminalStatus(nextSnapshot.status)) {
        phase.setGameOver()
        return nextSnapshot
      }
    }
  }, `${name}.playTurn`)

  const startMatch = action(async () => {
    resetMatch()

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

    const nextEngine = createChessEngine()

    if (nextEngine instanceof Error) {
      setupError.set(nextEngine)
      return nextEngine
    }

    const nextActors = createSideActors(matchConfig)

    if (nextActors instanceof Error) {
      setupError.set(nextActors)
      return nextActors
    }

    const storageResult = saveStoredMatchConfig(matchConfig)

    if (storageResult instanceof Error) {
      console.warn(storageResult)
    }

    engine.set(nextEngine)
    actors.set(nextActors)
    snapshot.set(nextEngine.getBoardSnapshot())
    selectedSquare.set(null)
    setupError.set(null)
    runtimeError.set(null)
    phase.setPlaying()

    void playTurn()
    return null
  }, `${name}.startMatch`)

  const retryTurn = action(async () => {
    runtimeError.set(null)
    phase.setPlaying()
    return await wrap(playTurn())
  }, `${name}.retryTurn`)

  const clickSquare = action((square: Square) => {
    const currentSnapshot = snapshot()
    const currentEngine = engine()
    const humanActor = activeHumanActor()

    if (!currentSnapshot || !currentEngine || !humanActor || phase() !== 'playing') {
      return null
    }

    const currentSelectedSquare = selectedSquare()
    const legalMoves = currentSelectedSquare
      ? currentEngine.getLegalMoves(currentSelectedSquare)
      : []

    if (currentSelectedSquare && legalMoves.includes(square)) {
      const promotion = getPromotion(currentSnapshot, currentSelectedSquare, square)
      const move: ActorMove = {
        from: currentSelectedSquare,
        to: square,
        promotion,
        uci: toUciMove(currentSelectedSquare, square, promotion),
      }

      const result = humanActor.submitMove(move)
      selectedSquare.set(null)

      if (result instanceof Error) {
        runtimeError.set(result)
        phase.setActorError()
        return result
      }

      return move
    }

    const movable = currentEngine.getMovablePieces(currentSnapshot.turn)

    if (movable.includes(square)) {
      selectedSquare.set(currentSelectedSquare === square ? null : square)
      return square
    }

    selectedSquare.set(null)
    return null
  }, `${name}.clickSquare`)

  return {
    availableActors: listRegisteredActors(),
    whiteSideConfig,
    blackSideConfig,
    whiteValidation,
    blackValidation,
    setupError,
    runtimeError,
    phase,
    snapshot,
    selectedSquare,
    selectedLegalMoves,
    movableSquares,
    activeHumanActor,
    setSideActor,
    updateSideConfig,
    startMatch,
    retryTurn,
    clickSquare,
    resetMatch,
  }
}

export const appModel: AppModel = createAppModel('app')
