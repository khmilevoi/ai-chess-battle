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
  type GameActor,
  type ActorMove,
  type BoardSnapshot,
  type ChessEngineFacade,
  type Square,
} from '../../domain/chess/types'
import { clearStoredGameSession, replayGameSession, saveStoredGameSession, type StoredGameSession } from '../../shared/storage/gameSessionStorage'
import { TurnCancelledError } from '../../shared/errors'

type SideActors = Record<
  BoardSnapshot['turn'],
  {
    actorKey: MatchConfig[BoardSnapshot['turn']]['actorKey']
    actor: ActorModel
  }
>

type ActiveActorState = {
  side: BoardSnapshot['turn']
  actorKey: MatchConfig[BoardSnapshot['turn']]['actorKey']
  actor: ActorModel
}

type GameStatusTone = 'neutral' | 'warning' | 'error' | 'success'

export type GameStatusView = {
  title: string
  detail: string
  tone: GameStatusTone
  busy: boolean
  actorLabel: string | null
  canRetry: boolean
}

type CreateGameModelOptions = {
  name: string
  config: MatchConfig
  initialSession: StoredGameSession | null
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
  initialSession,
  leaveToSetup,
}: CreateGameModelOptions) {
  const engine = atom<ChessEngineFacade | null>(null, `${name}.engine`)
  const snapshot = atom<BoardSnapshot | null>(null, `${name}.snapshot`)
  const actors = atom<SideActors | null>(null, `${name}.actors`)
  const selectedSquare = atom<Square | null>(null, `${name}.selectedSquare`)
  const runtimeError = atom<Error | null>(null, `${name}.runtimeError`)
  const turnActivity = reatomEnum(['idle', 'awaitingActor', 'applyingMove'], {
    name: `${name}.turnActivity`,
    initState: 'idle',
  })
  const phase = reatomEnum(['pending', 'playing', 'actorError', 'gameOver'], {
    name: `${name}.phase`,
    initState: 'pending',
  })

  const persistSnapshot = action((nextSnapshot: BoardSnapshot) => {
    saveStoredGameSession({
      version: 1,
      config,
      moves: nextSnapshot.history,
      updatedAt: Date.now(),
    })
    return null
  }, `${name}.persistSnapshot`)

  const resetState = action(() => {
    const currentSnapshot = snapshot()

    runMatchLoop.abort(
      new TurnCancelledError({
        side: currentSnapshot?.turn ?? 'white',
      }),
    )
    engine.set(null)
    actors.set(null)
    snapshot.set(null)
    selectedSquare.set(null)
    runtimeError.set(null)
    turnActivity.setIdle()
    phase.setPending()
    return null
  }, `${name}.resetState`)

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
  const activeActorState = computed(() => {
    const currentSnapshot = snapshot()
    const currentActors = actors()

    if (!currentSnapshot || !currentActors) {
      return null
    }

    return {
      side: currentSnapshot.turn,
      actorKey: currentActors[currentSnapshot.turn].actorKey,
      actor: currentActors[currentSnapshot.turn].actor,
    } satisfies ActiveActorState
  }, `${name}.activeActorState`)
  const activeHumanActor = computed(() => {
    const currentActorState = activeActorState()

    if (currentActorState?.actor.kind !== 'interactive') {
      return null
    }

    return currentActorState.actor
  }, `${name}.activeHumanActor`)
  const activeActorControls = computed(() => {
    if (phase() === 'pending' || phase() === 'gameOver') {
      return null
    }

    return activeActorState()
  }, `${name}.activeActorControls`)
  const activeActorLabel = computed(() => {
    const currentActorState = activeActorState()

    if (!currentActorState) {
      return null
    }

    return getRegisteredActor(currentActorState.actorKey).displayName
  }, `${name}.activeActorLabel`)
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
    return (
      phase() === 'playing' &&
      turnActivity() === 'awaitingActor' &&
      activeHumanActor() !== null
    )
  }, `${name}.boardInteractive`)
  const statusView = computed(() => {
    const currentSnapshot = snapshot()
    const currentPhase = phase()
    const currentError = runtimeError()
    const currentActorLabel = activeActorLabel()
    const currentHumanActor = activeHumanActor()
    const currentTurnActivity = turnActivity()

    if (!currentSnapshot || currentPhase === 'pending') {
      return {
        title: 'Preparing match',
        detail: 'Rebuilding board state and actor runtime.',
        tone: 'neutral',
        busy: true,
        actorLabel: currentSnapshot ? currentActorLabel : null,
        canRetry: false,
      } satisfies GameStatusView
    }

    if (currentPhase === 'actorError') {
      return {
        title: 'Turn failed',
        detail: currentError?.message ?? 'The current turn failed.',
        tone: 'error',
        busy: false,
        actorLabel: currentActorLabel,
        canRetry: true,
      } satisfies GameStatusView
    }

    if (currentPhase === 'gameOver') {
      return {
        title: 'Game over',
        detail: formatStatus(currentSnapshot),
        tone: 'success',
        busy: false,
        actorLabel: currentActorLabel,
        canRetry: false,
      } satisfies GameStatusView
    }

    if (currentTurnActivity === 'applyingMove') {
      return {
        title: 'Applying move',
        detail: `${currentActorLabel ?? 'Current actor'} submitted a move.`,
        tone: 'warning',
        busy: true,
        actorLabel: currentActorLabel,
        canRetry: false,
      } satisfies GameStatusView
    }

    if (currentTurnActivity === 'awaitingActor') {
      if (currentHumanActor) {
        return {
          title: 'Waiting for move',
          detail: `${currentActorLabel ?? 'Human actor'} is waiting for board input.`,
          tone: 'warning',
          busy: true,
          actorLabel: currentActorLabel,
          canRetry: false,
        } satisfies GameStatusView
      }

      return {
        title: 'Waiting for actor',
        detail: `${currentActorLabel ?? 'Actor'} is choosing a move.`,
        tone: 'warning',
        busy: true,
        actorLabel: currentActorLabel,
        canRetry: false,
      } satisfies GameStatusView
    }

    if (currentHumanActor) {
      return {
        title: 'Your turn',
        detail: 'Select a piece and then choose a legal target square.',
        tone: 'neutral',
        busy: false,
        actorLabel: currentActorLabel,
        canRetry: false,
      } satisfies GameStatusView
    }

    return {
      title: 'Turn ready',
      detail: `${currentActorLabel ?? 'Actor'} will move next.`,
      tone: 'neutral',
      busy: false,
      actorLabel: currentActorLabel,
      canRetry: false,
    } satisfies GameStatusView
  }, `${name}.statusView`)

  const handleTurnFailure = (error: Error) => {
    turnActivity.setIdle()

    if (errore.isAbortError(error)) {
      return error
    }

    runtimeError.set(error)
    phase.setActorError()
    return error
  }
  const requestCurrentActorMove = async () => {
    const currentEngine = engine()
    const currentSnapshot = snapshot()
    const currentActorState = activeActorState()

    if (!currentEngine || !currentSnapshot || !currentActorState) {
      return null
    }

    turnActivity.setAwaitingActor()

    const controller = abortVar.first()

    if (!controller) {
      return new TurnCancelledError({ side: currentSnapshot.turn })
    }

    const actorContext = buildActorContext(currentEngine, currentSnapshot)
    const activeActor = currentActorState.actor as GameActor

    if (activeActor.beforeRequestMove) {
      const beforeRequestResult = await wrap(
        activeActor.beforeRequestMove({
          context: actorContext,
          signal: controller.signal,
        }),
      )

      if (beforeRequestResult instanceof Error) {
        return beforeRequestResult
      }
    }

    return await wrap(
      activeActor.requestMove({
        context: actorContext,
        signal: controller.signal,
      }),
    )
  }
  const applyResolvedMove = (move: ActorMove) => {
    const currentEngine = engine()
    const currentSnapshot = snapshot()

    if (!currentEngine || !currentSnapshot) {
      return null
    }

    turnActivity.setApplyingMove()

    const nextSnapshot = currentEngine.applyMove(move)

    if (nextSnapshot instanceof Error) {
      return nextSnapshot
    }

    snapshot.set(nextSnapshot)
    selectedSquare.set(null)
    runtimeError.set(null)
    turnActivity.setIdle()
    persistSnapshot(nextSnapshot)

    if (isTerminalStatus(nextSnapshot.status)) {
      phase.setGameOver()
      return nextSnapshot
    }

    phase.setPlaying()
    return nextSnapshot
  }
  const playSingleTurn = async () => {
    const currentEngine = engine()
    const currentActors = actors()
    const currentSnapshot = snapshot()

    if (!currentEngine || !currentActors || !currentSnapshot) {
      return null
    }

    if (phase() !== 'playing') {
      return null
    }

    if (isTerminalStatus(currentSnapshot.status)) {
      phase.setGameOver()
      return currentSnapshot
    }

    runtimeError.set(null)

    const result = await wrap(requestCurrentActorMove())

    if (result === null) {
      return null
    }

    if (errore.isAbortError(result)) {
      return handleTurnFailure(result)
    }

    if (result instanceof Error) {
      return handleTurnFailure(result)
    }

    const nextSnapshot = applyResolvedMove(result)

    if (nextSnapshot === null) {
      return null
    }

    if (nextSnapshot instanceof Error) {
      return handleTurnFailure(nextSnapshot)
    }

    return nextSnapshot
  }
  const runMatchLoop = action(async () => {
    while (phase() === 'playing') {
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

      const turnResult = await wrap(playSingleTurn())

      if (turnResult === null) {
        return null
      }

      if (errore.isAbortError(turnResult)) {
        return turnResult
      }

      if (turnResult instanceof Error) {
        return turnResult
      }

      if (isTerminalStatus(turnResult.status)) {
        return turnResult
      }
    }

    return null
  }, `${name}.runMatchLoop`).extend(
    withAsync({
      status: true,
    }),
    withAbort(),
  )

  const startMatch = action(async () => {
    resetState()

    const nextActors = createSideActors(config)

    if (nextActors instanceof Error) {
      runtimeError.set(nextActors)
      phase.setActorError()
      return nextActors
    }

    const restoredState = (() => {
      if (initialSession === null) {
        const nextEngine = createChessEngine()

        if (nextEngine instanceof Error) {
          return nextEngine
        }

        return {
          engine: nextEngine,
          snapshot: nextEngine.getBoardSnapshot(),
        }
      }

      return replayGameSession(initialSession)
    })()

    if (restoredState instanceof Error) {
      runtimeError.set(restoredState)
      phase.setActorError()
      return restoredState
    }

    engine.set(restoredState.engine)
    actors.set(nextActors)
    snapshot.set(restoredState.snapshot)
    selectedSquare.set(null)
    runtimeError.set(null)
    turnActivity.setIdle()
    persistSnapshot(restoredState.snapshot)

    if (isTerminalStatus(restoredState.snapshot.status)) {
      phase.setGameOver()
      return null
    }

    phase.setPlaying()
    void runMatchLoop()
    return null
  }, `${name}.startMatch`)

  const retryTurn = action(() => {
    const currentSnapshot = snapshot()

    if (!currentSnapshot || phase() !== 'actorError') {
      return null
    }

    runtimeError.set(null)
    turnActivity.setIdle()
    phase.setPlaying()
    void runMatchLoop()
    return null
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
    resetState()
    clearStoredGameSession()
    leaveToSetup()
    return null
  }, `${name}.leaveMatch`)

  const dispose = action(() => {
    resetState()
    return null
  }, `${name}.dispose`)

  return {
    config,
    engine,
    snapshot,
    phase,
    runtimeError,
    selectedSquare,
    selectedLegalMoves,
    movableSquares,
    activeActorControls,
    activeHumanActor,
    statusText,
    statusView,
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
