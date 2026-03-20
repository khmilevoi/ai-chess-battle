import * as errore from 'errore'
import {
  abortVar,
  action,
  atom,
  computed,
  reatomEnum,
  withAbort,
  withAsync,
  wrap,
} from '@reatom/core'
import { getRegisteredActor } from '../../actors/registry'
import type {
  ActorModel,
  MatchConfig,
  MatchSideConfig,
} from '../../actors/registry'
import { createChessEngine } from '../../domain/chess/createChessEngine'
import {
  isTerminalStatus,
  toUciMove,
  type ActorContext,
  type ActorMove,
  type BoardSnapshot,
  type ChessEngineFacade,
  type Side,
  type Square,
} from '../../domain/chess/types'
import { TurnCancelledError } from '../../shared/errors'

type SideActors = Record<
  Side,
  {
    actorKey: MatchConfig[Side]['actorKey']
    actor: ActorModel
  }
>

type CreateGameModelOptions = {
  name: string
  config: MatchConfig
  leaveToSetup: () => void
}

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

function formatStatus(snapshot: BoardSnapshot): string {
  const status = snapshot.status

  if (status.kind === 'active') {
    return `${status.turn} to move`
  }

  if (status.kind === 'check') {
    return `${status.turn} is in check`
  }

  if (status.kind === 'checkmate') {
    return `${status.winner} wins by checkmate`
  }

  if (status.kind === 'stalemate') {
    return 'Stalemate'
  }

  return `Draw: ${status.reason}`
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

function createConfiguredActor(sideConfig: MatchSideConfig) {
  return getRegisteredActor(sideConfig.actorKey).create(sideConfig.actorConfig)
}

function createSideActors(config: MatchConfig): SideActors | Error {
  const whiteActor = createConfiguredActor(config.white)

  if (whiteActor instanceof Error) {
    return whiteActor
  }

  const blackActor = createConfiguredActor(config.black)

  if (blackActor instanceof Error) {
    return blackActor
  }

  return {
    white: {
      actorKey: config.white.actorKey,
      actor: whiteActor,
    },
    black: {
      actorKey: config.black.actorKey,
      actor: blackActor,
    },
  }
}

export function createGameModel({
  name,
  config,
  leaveToSetup,
}: CreateGameModelOptions) {
  const engine = atom<ChessEngineFacade | null>(null, `${name}.engine`)
  const snapshot = atom<BoardSnapshot | null>(null, `${name}.snapshot`)
  const actors = atom<SideActors | null>(null, `${name}.actors`)
  const selectedSquare = atom<Square | null>(null, `${name}.selectedSquare`)
  const runtimeError = atom<Error | null>(null, `${name}.runtimeError`)
  const phase = reatomEnum(['pending', 'playing', 'actorError', 'gameOver'], {
    name: `${name}.phase`,
    initState: 'pending',
  })

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
    return actor.kind === 'interactive' ? actor : null
  }, `${name}.activeHumanActor`)
  const statusText = computed(() => {
    const currentSnapshot = snapshot()

    if (!currentSnapshot) {
      return 'Preparing match'
    }

    return formatStatus(currentSnapshot)
  }, `${name}.statusText`)
  const historyText = computed(() => {
    const currentSnapshot = snapshot()

    if (!currentSnapshot || currentSnapshot.history.length === 0) {
      return 'No moves yet.'
    }

    return currentSnapshot.history.join('\n')
  }, `${name}.historyText`)
  const boardInteractive = computed(() => {
    return phase() === 'playing' && activeHumanActor() !== null
  }, `${name}.boardInteractive`)

  const dispose = action(() => {
    const currentSnapshot = snapshot()

    playTurn.abort(
      new TurnCancelledError({
        side: currentSnapshot?.turn ?? 'white',
      }),
    )
    engine.set(null)
    actors.set(null)
    snapshot.set(null)
    selectedSquare.set(null)
    runtimeError.set(null)
    phase.setPending()
    return null
  }, `${name}.dispose`)

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

      const controller = abortVar.first()

      if (!controller) {
        return new TurnCancelledError({
          side: currentSnapshot.turn,
        })
      }

      const actorContext = buildActorContext(currentEngine, currentSnapshot)
      const result = await wrap(
        currentActors[currentSnapshot.turn].actor.requestMove({
          context: actorContext,
          signal: controller.signal,
        }),
      )

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
  }, `${name}.playTurn`).extend(
    withAsync({
      cacheParams: true,
      status: true,
    }),
    withAbort(),
  )

  const startMatch = action(async () => {
    dispose()

    const nextEngine = createChessEngine()

    if (nextEngine instanceof Error) {
      runtimeError.set(nextEngine)
      phase.setActorError()
      return nextEngine
    }

    const nextActors = createSideActors(config)

    if (nextActors instanceof Error) {
      runtimeError.set(nextActors)
      phase.setActorError()
      return nextActors
    }

    engine.set(nextEngine)
    actors.set(nextActors)

    const nextSnapshot = nextEngine.getBoardSnapshot()
    snapshot.set(nextSnapshot)
    selectedSquare.set(null)
    runtimeError.set(null)
    phase.setPlaying()

    void playTurn()
    return null
  }, `${name}.startMatch`)

  const retryTurn = action(async () => {
    runtimeError.set(null)
    phase.setPlaying()
    return await wrap(playTurn.retry())
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

  const leaveMatch = action(() => {
    dispose()
    leaveToSetup()
    return null
  }, `${name}.leaveMatch`)

  return {
    config,
    engine,
    snapshot,
    phase,
    runtimeError,
    selectedSquare,
    selectedLegalMoves,
    movableSquares,
    activeHumanActor,
    statusText,
    historyText,
    boardInteractive,
    startMatch,
    retryTurn,
    clickSquare,
    leaveMatch,
    dispose,
  }
}

export type GameModel = ReturnType<typeof createGameModel>
