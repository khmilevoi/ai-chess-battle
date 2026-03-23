import * as errore from 'errore'
import {
  abortVar,
  action,
  atom,
  computed,
  peek,
  reatomEnum,
  withAbort,
  withAsync,
  withConnectHook,
  wrap,
} from '@reatom/core'
import { getRegisteredActor } from '@/actors/registry'
import type {
  ActorModel,
  MatchConfig,
  MatchSideConfig,
} from '@/actors/registry'
import {
  isTerminalStatus,
  toUciMove,
  type ActorContext,
  type ActorMove,
  type BoardSnapshot,
  type ChessEngineFacade,
  type GameActor,
  type Square,
} from '@/domain/chess/types'
import {
  activeGameIdAtom,
  replayStoredGameRecord,
  saveStoredGameRecord,
  setActiveGameId,
  storedGameRecordAtom,
  updateStoredGameRecord,
  type StoredGameActorControls,
} from '@/shared/storage/gameSessionStorage'
import { StorageError, TurnCancelledError } from '@/shared/errors'

type SideActors = Record<
  BoardSnapshot['turn'],
  {
    actorKey: MatchConfig[BoardSnapshot['turn']]['actorKey']
    actor: ActorModel
    controlGroupKey: string | null
  }
>

type ActiveActorState = {
  side: BoardSnapshot['turn']
  actorKey: MatchConfig[BoardSnapshot['turn']]['actorKey']
  actor: ActorModel
  controlGroupKey: string | null
}

type ActorPanelEntry = {
  panelKey: string
  side: BoardSnapshot['turn']
  sides: Array<BoardSnapshot['turn']>
  activeSide: BoardSnapshot['turn'] | null
  actorKey: MatchConfig[BoardSnapshot['turn']]['actorKey']
  actor: ActorModel
  controlGroupKey: string | null
  displayName: string
  hasControls: boolean
  isActive: boolean
}

type RuntimeControlsByGroupKey = Record<string, unknown>

type HistoryMove = {
  moveNumber: number
  uci: string
  isCurrent: boolean
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
  gameId: string
  leaveToSetup: () => void
  leaveToGames: () => void
  startOnConnect?: boolean
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

function createConfiguredActor(
  sideConfig: MatchSideConfig,
  runtimeControlsByGroupKey: RuntimeControlsByGroupKey = {},
) {
  const descriptor = getRegisteredActor(sideConfig.actorKey)
  const controlGroupKey =
    descriptor.controlsContract?.getControlGroupKey(sideConfig.actorConfig as never) ??
    null
  const actor = descriptor.create(
    sideConfig.actorConfig,
    controlGroupKey === null
      ? undefined
      : {
          runtimeControls: runtimeControlsByGroupKey[controlGroupKey],
        },
  )

  if (actor instanceof Error) {
    return actor
  }

  return {
    actorKey: sideConfig.actorKey,
    actor,
    controlGroupKey,
  }
}

function createSideActors(
  config: MatchConfig,
  runtimeControlsByGroupKey: RuntimeControlsByGroupKey = {},
): SideActors | Error {
  const whiteActor = createConfiguredActor(config.white, runtimeControlsByGroupKey)

  if (whiteActor instanceof Error) {
    return whiteActor
  }

  const blackActor = createConfiguredActor(config.black, runtimeControlsByGroupKey)

  if (blackActor instanceof Error) {
    return blackActor
  }

  return {
    white: whiteActor,
    black: blackActor,
  }
}

function createMissingGameError(gameId: string): StorageError {
  return new StorageError({
    message: `Saved game "${gameId}" was not found.`,
  })
}

export function createGameModel({
  name,
  gameId,
  leaveToSetup,
  leaveToGames,
  startOnConnect = false,
}: CreateGameModelOptions) {
  const storedGame = storedGameRecordAtom(gameId)
  const engine = atom<ChessEngineFacade | null>(null, `${name}.engine`)
  const snapshot = atom<BoardSnapshot | null>(null, `${name}.snapshot`)
  const actors = atom<SideActors | null>(null, `${name}.actors`)
  const historyCursor = atom(0, `${name}.historyCursor`)
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
  const persistActorControls = action(
    (controlGroupKey: string, controls: unknown) => {
      const currentGame = peek(storedGameRecordAtom(gameId))

      if (currentGame === null) {
        return createMissingGameError(gameId)
      }

      const persisted = updateStoredGameRecord({
        gameId,
        actorControls: {
          ...currentGame.actorControls,
          [controlGroupKey]: controls,
        },
      })

      if (persisted === null) {
        return new StorageError({
          message: `Failed to persist actor controls for saved game "${gameId}".`,
        })
      }

      return persisted
    },
    `${name}.persistActorControls`,
  )

  const createRuntimeControlsByGroupKey = (
    config: MatchConfig,
    actorControls: StoredGameActorControls,
  ): RuntimeControlsByGroupKey => {
    const runtimeControlsByGroupKey: RuntimeControlsByGroupKey = {}

    for (const side of ['white', 'black'] as const) {
      const sideConfig = config[side]
      const descriptor = getRegisteredActor(sideConfig.actorKey)
      const controlsContract = descriptor.controlsContract

      if (controlsContract === undefined) {
        continue
      }

      const controlGroupKey = controlsContract.getControlGroupKey(
        sideConfig.actorConfig as never,
      )

      if (controlGroupKey in runtimeControlsByGroupKey) {
        continue
      }

      const initialStateResult = controlsContract.storageSchema.safeParse(
        actorControls[controlGroupKey],
      )
      const initialState = initialStateResult.success
        ? initialStateResult.data
        : controlsContract.createDefaultStoredState()

      runtimeControlsByGroupKey[controlGroupKey] =
        controlsContract.createRuntimeControls({
          name: `${name}.controls(${controlGroupKey})`,
          initialState,
          persist: (nextState) => {
            const normalizedStateResult = controlsContract.storageSchema.safeParse(
              nextState,
            )

            if (!normalizedStateResult.success) {
              console.warn(
                new StorageError({
                  message: `Actor controls "${controlGroupKey}" failed validation.`,
                  cause: normalizedStateResult.error,
                }),
              )
              return
            }

            const persisted = persistActorControls(
              controlGroupKey,
              normalizedStateResult.data,
            )

            if (persisted instanceof Error) {
              console.warn(persisted)
            }
          },
        })
    }

    return runtimeControlsByGroupKey
  }

  const latestMoveCount = computed(
    () => storedGame()?.moves.length ?? 0,
    `${name}.latestMoveCount`,
  )
  const isAtLatestMove = computed(
    () => historyCursor() === latestMoveCount(),
    `${name}.isAtLatestMove`,
  )
  const canGoPrevious = computed(
    () => historyCursor() > 0,
    `${name}.canGoPrevious`,
  )
  const canGoNext = computed(
    () => historyCursor() < latestMoveCount(),
    `${name}.canGoNext`,
  )
  const canContinueFromCurrentMove = computed(() => {
    const currentSnapshot = snapshot()

    return (
      currentSnapshot !== null &&
      isAtLatestMove() &&
      !isTerminalStatus(currentSnapshot.status)
    )
  }, `${name}.canContinueFromCurrentMove`)
  const historyMoves = computed(() => {
    const currentGame = storedGame()
    const cursor = historyCursor()

    if (!currentGame) {
      return [] as Array<HistoryMove>
    }

    return currentGame.moves.map((uci, index) => ({
      moveNumber: index + 1,
      uci,
      isCurrent: cursor === index + 1,
    }))
  }, `${name}.historyMoves`)
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
      controlGroupKey: currentActors[currentSnapshot.turn].controlGroupKey,
    } satisfies ActiveActorState
  }, `${name}.activeActorState`)
  const actorPanels = computed(() => {
    const currentActors = actors()
    const currentSnapshot = snapshot()

    if (!currentActors) {
      return [] as Array<ActorPanelEntry>
    }

    const whiteActorState = currentActors.white
    const blackActorState = currentActors.black
    const whiteDescriptor = getRegisteredActor(whiteActorState.actorKey)
    const blackDescriptor = getRegisteredActor(blackActorState.actorKey)

    if (
      whiteActorState.controlGroupKey !== null &&
      whiteActorState.controlGroupKey === blackActorState.controlGroupKey &&
      whiteDescriptor.ControlsComponent !== undefined &&
      whiteDescriptor.ControlsComponent === blackDescriptor.ControlsComponent
    ) {
      const activeSide = currentSnapshot?.turn ?? null
      const representativeSide = activeSide ?? 'white'
      const representativeActorState = currentActors[representativeSide]
      const representativeDescriptor = getRegisteredActor(
        representativeActorState.actorKey,
      )

      return [
        {
          panelKey: `controls:${whiteActorState.controlGroupKey}`,
          side: representativeSide,
          sides: ['white', 'black'],
          activeSide,
          actorKey: representativeActorState.actorKey,
          actor: representativeActorState.actor,
          controlGroupKey: representativeActorState.controlGroupKey,
          displayName: representativeDescriptor.displayName,
          hasControls: true,
          isActive: activeSide !== null,
        } satisfies ActorPanelEntry,
      ]
    }

    return (['white', 'black'] as const).map((side) => {
      const actorState = currentActors[side]
      const descriptor = getRegisteredActor(actorState.actorKey)
      const isActive = currentSnapshot?.turn === side

      return {
        panelKey: side,
        side,
        sides: [side],
        activeSide: isActive ? side : null,
        actorKey: actorState.actorKey,
        actor: actorState.actor,
        controlGroupKey: actorState.controlGroupKey,
        displayName: descriptor.displayName,
        hasControls: descriptor.ControlsComponent !== undefined,
        isActive,
      } satisfies ActorPanelEntry
    })
  }, `${name}.actorPanels`)
  const activeHumanActor = computed(() => {
    const currentActorState = activeActorState()

    if (currentActorState?.actor.kind !== 'interactive') {
      return null
    }

    return currentActorState.actor
  }, `${name}.activeHumanActor`)
  const activeActorControls = computed(() => {
    if (!canContinueFromCurrentMove() || phase() === 'pending') {
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
  const boardInteractive = computed(() => {
    return (
      canContinueFromCurrentMove() &&
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
    const cursor = historyCursor()
    const latest = latestMoveCount()

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

    if (!isAtLatestMove()) {
      return {
        title: 'Reviewing history',
        detail:
          latest === 0
            ? 'You are viewing the initial position. Return to the latest move to continue the game.'
            : `You are viewing move ${cursor} of ${latest}. Return to the latest move to continue the game.`,
        tone: 'neutral',
        busy: false,
        actorLabel: currentActorLabel,
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
        canRetry: canContinueFromCurrentMove(),
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

  const stopLiveLoop = action(() => {
    const currentSnapshot = snapshot()

    runMatchLoop.abort(
      new TurnCancelledError({
        side: currentSnapshot?.turn ?? 'white',
      }),
    )
    turnActivity.setIdle()
    selectedSquare.set(null)
    return null
  }, `${name}.stopLiveLoop`)

  const resetState = action(() => {
    stopLiveLoop()
    engine.set(null)
    actors.set(null)
    snapshot.set(null)
    historyCursor.set(0)
    selectedSquare.set(null)
    runtimeError.set(null)
    phase.setPending()
    return null
  }, `${name}.resetState`)

  const syncPositionFromHistory = action((targetCursor?: number) => {
    const currentGame = storedGame()

    if (currentGame === null) {
      const error = createMissingGameError(gameId)
      runtimeError.set(error)
      phase.setActorError()
      return error
    }

    const nextCursor =
      targetCursor === undefined
        ? historyCursor()
        : Math.min(Math.max(targetCursor, 0), currentGame.moves.length)
    const replayed = replayStoredGameRecord(currentGame, { moveCount: nextCursor })

    if (replayed instanceof Error) {
      runtimeError.set(replayed)
      phase.setActorError()
      return replayed
    }

    engine.set(replayed.engine)
    snapshot.set(replayed.snapshot)
    historyCursor.set(nextCursor)
    selectedSquare.set(null)
    runtimeError.set(null)
    turnActivity.setIdle()

    if (isTerminalStatus(replayed.snapshot.status)) {
      phase.setGameOver()

      if (peek(activeGameIdAtom) === gameId) {
        setActiveGameId(null)
      }

      return replayed.snapshot
    }

    phase.setPlaying()
    return replayed.snapshot
  }, `${name}.syncPositionFromHistory`)

  const persistSnapshot = action((nextSnapshot: BoardSnapshot) => {
    const currentGame = peek(storedGameRecordAtom(gameId))

    if (currentGame === null) {
      return createMissingGameError(gameId)
    }

    const persisted = saveStoredGameRecord({
      ...currentGame,
      moves: nextSnapshot.history,
      updatedAt: Date.now(),
    })

    if (persisted === null) {
      return new StorageError({
        message: `Failed to persist saved game "${gameId}".`,
      })
    }

    if (isTerminalStatus(nextSnapshot.status)) {
      if (peek(activeGameIdAtom) === gameId) {
        setActiveGameId(null)
      }
    } else {
      setActiveGameId(gameId)
    }

    return persisted
  }, `${name}.persistSnapshot`)

  const movableSquares = computed(() => {
    const currentEngine = engine()
    const currentSnapshot = snapshot()

    if (
      !currentEngine ||
      !currentSnapshot ||
      !canContinueFromCurrentMove()
    ) {
      return [] as Array<Square>
    }

    return currentEngine.getMovablePieces(currentSnapshot.turn)
  }, `${name}.movableSquares`)
  const selectedLegalMoves = computed(() => {
    const currentEngine = engine()
    const square = selectedSquare()

    if (
      !currentEngine ||
      square === null ||
      !canContinueFromCurrentMove()
    ) {
      return [] as Array<Square>
    }

    return currentEngine.getLegalMoves(square)
  }, `${name}.selectedLegalMoves`)

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

    if (
      !currentEngine ||
      !currentSnapshot ||
      !currentActorState ||
      !canContinueFromCurrentMove()
    ) {
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

    if (
      !currentEngine ||
      !currentSnapshot ||
      !canContinueFromCurrentMove()
    ) {
      return null
    }

    turnActivity.setApplyingMove()

    const nextSnapshot = currentEngine.applyMove(move)

    if (nextSnapshot instanceof Error) {
      return nextSnapshot
    }

    snapshot.set(nextSnapshot)
    historyCursor.set(nextSnapshot.history.length)
    selectedSquare.set(null)
    runtimeError.set(null)
    turnActivity.setIdle()

    const persisted = persistSnapshot(nextSnapshot)

    if (persisted instanceof Error) {
      return persisted
    }

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

    if (
      !currentEngine ||
      !currentActors ||
      !currentSnapshot ||
      !canContinueFromCurrentMove()
    ) {
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
    while (phase() === 'playing' && isAtLatestMove()) {
      const currentSnapshot = snapshot()

      if (currentSnapshot === null || !canContinueFromCurrentMove()) {
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

    const currentGame = peek(storedGameRecordAtom(gameId))

    if (currentGame === null) {
      const error = createMissingGameError(gameId)
      runtimeError.set(error)
      phase.setActorError()
      return error
    }

    const nextActors = createSideActors(
      currentGame.config,
      createRuntimeControlsByGroupKey(
        currentGame.config,
        currentGame.actorControls,
      ),
    )

    if (nextActors instanceof Error) {
      runtimeError.set(nextActors)
      phase.setActorError()
      return nextActors
    }

    actors.set(nextActors)
    const restoredSnapshot = syncPositionFromHistory(currentGame.moves.length)

    if (restoredSnapshot instanceof Error) {
      return restoredSnapshot
    }

    if (isTerminalStatus(restoredSnapshot.status)) {
      phase.setGameOver()
      return null
    }

    phase.setPlaying()
    void runMatchLoop()
    return null
  }, `${name}.startMatch`)

  const retryTurn = action(() => {
    if (phase() !== 'actorError' || !canContinueFromCurrentMove()) {
      return null
    }

    runtimeError.set(null)
    turnActivity.setIdle()
    phase.setPlaying()
    void runMatchLoop()
    return null
  }, `${name}.retryTurn`)

  const goToMove = action((nextCursor: number) => {
    stopLiveLoop()
    const syncedSnapshot = syncPositionFromHistory(nextCursor)

    if (syncedSnapshot instanceof Error) {
      return syncedSnapshot
    }

    if (
      nextCursor === latestMoveCount() &&
      !isTerminalStatus(syncedSnapshot.status)
    ) {
      phase.setPlaying()
      void runMatchLoop()
    }

    return nextCursor
  }, `${name}.goToMove`)

  const goToPreviousMove = action(() => {
    if (!canGoPrevious()) {
      return historyCursor()
    }

    return goToMove(historyCursor() - 1)
  }, `${name}.goToPreviousMove`)

  const goToNextMove = action(() => {
    if (!canGoNext()) {
      return historyCursor()
    }

    return goToMove(historyCursor() + 1)
  }, `${name}.goToNextMove`)

  const clickSquare = action((square: Square) => {
    const currentSnapshot = snapshot()
    const currentEngine = engine()
    const humanActor = activeHumanActor()

    if (
      !currentSnapshot ||
      !currentEngine ||
      !humanActor ||
      phase() !== 'playing' ||
      !canContinueFromCurrentMove()
    ) {
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
    leaveToSetup()
    return null
  }, `${name}.leaveMatch`)

  const openGames = action(() => {
    resetState()
    leaveToGames()
    return null
  }, `${name}.openGames`)

  const dispose = action(() => {
    resetState()
    return null
  }, `${name}.dispose`)

  if (startOnConnect) {
    snapshot.extend(withConnectHook(async () => {
      let cleaned = false
      const cleanupOnce = () => {
        if (cleaned) {
          return
        }

        cleaned = true
        dispose()
      }

      const startResult = await wrap(startMatch())

      if (startResult instanceof Error) {
        console.warn(startResult)
      }

      return cleanupOnce
    }))
  }

  return {
    gameId,
    storedGame,
    engine,
    snapshot,
    phase,
    runtimeError,
    historyCursor,
    latestMoveCount,
    historyMoves,
    canGoPrevious,
    canGoNext,
    isAtLatestMove,
    canContinueFromCurrentMove,
    selectedSquare,
    selectedLegalMoves,
    movableSquares,
    actorPanels,
    activeActorControls,
    activeHumanActor,
    statusText,
    statusView,
    boardInteractive,
    startMatch,
    retryTurn,
    goToMove,
    goToPreviousMove,
    goToNextMove,
    clickSquare,
    leaveMatch,
    openGames,
    dispose,
  }
}

export type GameModel = ReturnType<typeof createGameModel>
