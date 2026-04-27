import * as errore from 'errore'
import {
  abortVar,
  action,
  atom,
  computed,
  effect,
  peek,
  reatomEnum,
  withAbort,
  withAsync,
  withConnectHook,
  wrap,
} from '@reatom/core'
import { getRegisteredActor } from '@/actors/registry'
import { getRegisteredArbiter } from '@/arbiter/registry'
import type {
  ActorModel,
  MatchConfig,
  MatchSideConfig,
} from '@/actors/registry'
import type { ArbiterModel, Eval } from '@/arbiter/types'
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
import { vaultSecretsAtom } from '@/shared/storage/credentialVault'
import { CredentialError, StorageError, TurnCancelledError } from '@/shared/errors'

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

type MatchInfoEntry = {
  side: BoardSnapshot['turn']
  actorKey: MatchConfig[BoardSnapshot['turn']]['actorKey']
  actorConfig: MatchConfig[BoardSnapshot['turn']]['actorConfig']
  displayName: string
  summary: string
}

type ArbiterInfoEntry = {
  arbiterKey: NonNullable<MatchConfig['arbiter']>['arbiterKey']
  displayName: string
  model: string
  modelLabel: string
}

type RuntimeControlsByGroupKey = Record<string, unknown>

type HistoryMove = {
  moveNumber: number
  uci: string
}

type ArbiterQueueEntry = {
  moveIndex: number
}

type ArbiterLiveComment = {
  id: number
  side: BoardSnapshot['turn']
  text: string
  createdAt: number
}

type GameStatusTone = 'neutral' | 'warning' | 'error' | 'success'

export type GameStatusView = {
  title: string
  detail: string
  tone: GameStatusTone
  busy: boolean
  actorLabel: string | null
  canRetry: boolean
  canAbort: boolean
  elapsedSeconds: number | null
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
  return {
    side: snapshot.turn,
    snapshot,
    legalMovesBySquare: engine.getAllLegalMoves(),
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

function isPromotionMove(
  snapshot: BoardSnapshot,
  from: Square,
  to: Square,
): boolean {
  const piece = snapshot.pieces.find((candidate) => candidate.square === from)

  if (!piece || piece.type !== 'pawn') {
    return false
  }

  const targetRank = to.at(-1)

  return (
    (piece.side === 'white' && targetRank === '8') ||
    (piece.side === 'black' && targetRank === '1')
  )
}

function createConfiguredActor(
  sideConfig: MatchSideConfig,
  runtimeControlsByGroupKey: RuntimeControlsByGroupKey = {},
) {
  const descriptor = getRegisteredActor(sideConfig.actorKey)
  const secretField = descriptor.secretField

  if (
    secretField &&
    typeof sideConfig.actorConfig === 'object' &&
    sideConfig.actorConfig !== null &&
    secretField in sideConfig.actorConfig &&
    typeof (sideConfig.actorConfig as Record<string, unknown>)[secretField] === 'string' &&
    (sideConfig.actorConfig as Record<string, string>)[secretField].length === 0
  ) {
    return new CredentialError({
      message: `Unlock the vault and enter an API key for ${descriptor.displayName}.`,
    })
  }

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

function getMoveSide(moveIndex: number): BoardSnapshot['turn'] {
  return moveIndex % 2 === 0 ? 'white' : 'black'
}

function createUnavailableArbiter(error: Error): ArbiterModel {
  return {
    async requestEvaluation() {
      return error
    },
  }
}

function createConfiguredArbiter(
  config: MatchConfig['arbiter'],
): ArbiterModel | null {
  if (config === null || config === undefined) {
    return null
  }

  const descriptor = getRegisteredArbiter(config.arbiterKey)
  const apiKey = peek(vaultSecretsAtom)[config.arbiterKey] ?? ''

  if (apiKey.length === 0) {
    return createUnavailableArbiter(
      new CredentialError({
        message: `Unlock the vault and enter an API key for ${descriptor.displayName}.`,
      }),
    )
  }

  return descriptor.create({
    apiKey,
    config: config.arbiterConfig as never,
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

  type PendingPromotion = { from: Square; to: Square }
  const pendingPromotion = atom<PendingPromotion | null>(null, `${name}.pendingPromotion`)

  const turnStartedAtAtom = atom<number | null>(null, `${name}.turnStartedAt`)
  const turnElapsedSecondsAtom = atom<number>(0, `${name}.turnElapsedSeconds`)
  const runtimeError = atom<Error | null>(null, `${name}.runtimeError`)
  const arbiterRuntime = atom<ArbiterModel | null>(null, `${name}.arbiterRuntime`)
  const arbiterQueue = atom([] as Array<ArbiterQueueEntry>, `${name}.arbiterQueue`)
  const arbiterInFlight = atom<ArbiterQueueEntry | null>(null, `${name}.arbiterInFlight`)
  const evaluationsByMove = atom([] as Array<Eval | null>, `${name}.evaluationsByMove`)
  const arbiterLiveComment = atom<ArbiterLiveComment | null>(
    null,
    `${name}.arbiterLiveComment`,
  )
  const arbiterWarningShown = atom(false, `${name}.arbiterWarningShown`)
  const startupBlockedConfigSignature = atom<string | null>(
    null,
    `${name}.startupBlockedConfigSignature`,
  )
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
              import('@/shared/ui/Toast').then(({ pushToast }) => {
                pushToast({
                  tone: 'warning',
                  title: 'Settings save skipped',
                  description: `Actor controls failed validation and were not persisted.`,
                })
              })
              return
            }

            const persisted = persistActorControls(
              controlGroupKey,
              normalizedStateResult.data,
            )

            if (persisted instanceof Error) {
              import('@/shared/ui/Toast').then(({ pushToast }) => {
                pushToast({
                  tone: 'warning',
                  title: 'Settings not saved',
                  description: 'Could not persist actor controls to storage.',
                })
              })
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
  const storedGameConfigSignature = atom<string | null>(null, `${name}.storedGameConfigSignature`)
  effect(() => {
    const currentGame = storedGame()
    const nextSig = currentGame === null ? null : JSON.stringify(currentGame.config)
    if (nextSig !== peek(storedGameConfigSignature)) {
      storedGameConfigSignature.set(nextSig)
    }
  }, `${name}.syncStoredGameConfigSignature`)
  const historyMoves = atom([] as Array<HistoryMove>, `${name}.historyMoves`)
  effect(() => {
    const currentGame = storedGame()
    const nextMoves = currentGame?.moves ?? []
    const prev = peek(historyMoves)
    if (
      prev.length === nextMoves.length &&
      (nextMoves.length === 0 || prev[prev.length - 1]?.uci === nextMoves[nextMoves.length - 1])
    ) {
      return
    }
    historyMoves.set(nextMoves.map((uci, index) => ({ moveNumber: index + 1, uci })))
  }, `${name}.syncHistoryMoves`)
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
  const matchInfoEntries = computed(() => {
    const config = storedGame()?.config

    if (!config) {
      return [] as Array<MatchInfoEntry>
    }

    return (['white', 'black'] as const).map((side) => {
      const sideConfig = config[side]
      const descriptor = getRegisteredActor(sideConfig.actorKey)

      return {
        side,
        actorKey: sideConfig.actorKey,
        actorConfig: sideConfig.actorConfig,
        displayName: descriptor.displayName,
        summary: descriptor.summary,
      } satisfies MatchInfoEntry
    })
  }, `${name}.matchInfoEntries`)
  const arbiterInfoEntry = computed(() => {
    const arbiterConfig = storedGame()?.config.arbiter

    if (arbiterConfig === null || arbiterConfig === undefined) {
      return null
    }

    const descriptor = getRegisteredArbiter(arbiterConfig.arbiterKey)
    const modelLabel =
      descriptor.modelOptions.find(
        (option) => option.value === arbiterConfig.arbiterConfig.model,
      )?.label ?? arbiterConfig.arbiterConfig.model

    return {
      arbiterKey: arbiterConfig.arbiterKey,
      displayName: descriptor.displayName,
      model: arbiterConfig.arbiterConfig.model,
      modelLabel,
    } satisfies ArbiterInfoEntry
  }, `${name}.arbiterInfoEntry`)
  const resolvedEvaluation = computed(() => {
    const cursor = historyCursor()

    if (cursor === 0) {
      return null
    }

    const currentEvaluations = evaluationsByMove()

    for (let index = Math.min(cursor, currentEvaluations.length) - 1; index >= 0; index -= 1) {
      const evaluation = currentEvaluations[index]

      if (evaluation !== null && evaluation !== undefined) {
        return evaluation
      }
    }

    return null
  }, `${name}.resolvedEvaluation`)
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
    const elapsed = turnElapsedSecondsAtom()

    if (!currentSnapshot || currentPhase === 'pending') {
      return {
        title: 'Preparing match',
        detail: 'Rebuilding board state and actor runtime.',
        tone: 'neutral',
        busy: true,
        actorLabel: currentSnapshot ? currentActorLabel : null,
        canRetry: false,
        canAbort: false,
        elapsedSeconds: null,
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
        canAbort: false,
        elapsedSeconds: null,
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
        canAbort: false,
        elapsedSeconds: null,
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
        canAbort: false,
        elapsedSeconds: null,
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
        canAbort: false,
        elapsedSeconds: null,
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
          canAbort: false,
          elapsedSeconds: null,
        } satisfies GameStatusView
      }

      return {
        title: 'Waiting for actor',
        detail: `${currentActorLabel ?? 'Actor'} is choosing a move.`,
        tone: 'warning',
        busy: true,
        actorLabel: currentActorLabel,
        canRetry: false,
        canAbort: true,
        elapsedSeconds: elapsed > 0 ? elapsed : null,
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
        canAbort: false,
        elapsedSeconds: null,
      } satisfies GameStatusView
    }

    return {
      title: 'Turn ready',
      detail: `${currentActorLabel ?? 'Actor'} will move next.`,
      tone: 'neutral',
      busy: false,
      actorLabel: currentActorLabel,
      canRetry: false,
      canAbort: false,
      elapsedSeconds: null,
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
    runArbiterQueue.abort(
      new TurnCancelledError({
        side: peek(snapshot)?.turn ?? 'white',
      }),
    )
    engine.set(null)
    actors.set(null)
    arbiterRuntime.set(null)
    arbiterQueue.set([])
    arbiterInFlight.set(null)
    evaluationsByMove.set([])
    arbiterLiveComment.set(null)
    arbiterWarningShown.set(false)
    snapshot.set(null)
    historyCursor.set(0)
    selectedSquare.set(null)
    runtimeError.set(null)
    startupBlockedConfigSignature.set(null)
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

    const persisted = saveStoredGameRecord(
      {
        ...currentGame,
        moves: nextSnapshot.history,
        updatedAt: Date.now(),
      },
      {
        snapshot: nextSnapshot,
      },
    )

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
  const persistArbiterEvaluation = action(
    ({
      moveIndex,
      evaluation,
      syncLocal = true,
    }: {
      moveIndex: number
      evaluation: Eval | null
      syncLocal?: boolean
    }) => {
      const currentGame = peek(storedGameRecordAtom(gameId))

      if (currentGame === null) {
        return createMissingGameError(gameId)
      }

      const nextEvaluations = [...(currentGame.evaluations ?? [])]
      nextEvaluations[moveIndex] = evaluation

      const persisted = updateStoredGameRecord({
        gameId,
        evaluations: nextEvaluations,
        updatedAt: currentGame.updatedAt,
      })

      if (persisted === null) {
        return new StorageError({
          message: `Failed to persist arbiter evaluation for saved game "${gameId}".`,
        })
      }

      if (syncLocal) {
        const localEvaluations = [...peek(evaluationsByMove)]
        localEvaluations[moveIndex] = evaluation
        evaluationsByMove.set(localEvaluations)
      }

      return persisted
    },
    `${name}.persistArbiterEvaluation`,
  )
  const dismissArbiterLiveComment = action(() => {
    arbiterLiveComment.set(null)
    return null
  }, `${name}.dismissArbiterLiveComment`)
  const queueArbiterEvaluation = action((moveIndex: number) => {
    if (peek(arbiterRuntime) === null) {
      return null
    }

    const nextQueue = [...peek(arbiterQueue), { moveIndex }]
    arbiterQueue.set(nextQueue)

    if (peek(arbiterInFlight) === null) {
      void runArbiterQueue()
    }

    return moveIndex
  }, `${name}.queueArbiterEvaluation`)
  const pushArbiterUnavailableWarning = action((error: Error) => {
    if (peek(arbiterWarningShown)) {
      return error
    }

    arbiterWarningShown.set(true)

    import('@/shared/ui/Toast').then(({ pushToast }) => {
      pushToast({
        tone: 'warning',
        title: 'Arbiter unavailable',
        description: error.message,
      })
    })

    return error
  }, `${name}.pushArbiterUnavailableWarning`)
  const runArbiterQueue = action(async () => {
    while (true) {
      const runtime = arbiterRuntime()
      const nextEntry = arbiterQueue()[0] ?? null

      if (runtime === null || nextEntry === null) {
        arbiterInFlight.set(null)
        return null
      }

      const currentGame = peek(storedGameRecordAtom(gameId))

      if (currentGame === null) {
        arbiterInFlight.set(null)
        return createMissingGameError(gameId)
      }

      const replayed = replayStoredGameRecord(currentGame, {
        moveCount: nextEntry.moveIndex + 1,
      })

      if (replayed instanceof Error) {
        console.warn(replayed)
        const persisted = persistArbiterEvaluation({
          moveIndex: nextEntry.moveIndex,
          evaluation: null,
        })

        if (persisted instanceof Error) {
          console.warn(persisted)
        }

        arbiterQueue.set(peek(arbiterQueue).slice(1))
        arbiterInFlight.set(null)
        continue
      }

      arbiterInFlight.set(nextEntry)

      const controller = abortVar.first()

      if (!controller) {
        arbiterInFlight.set(null)
        return null
      }

      const result = await wrap(
        runtime.requestEvaluation({
          snapshot: replayed.snapshot,
          signal: controller.signal,
        }),
      )

      const syncLocal = peek(snapshot) !== null && peek(phase) !== 'pending'

      if (errore.isAbortError(result)) {
        const persisted = persistArbiterEvaluation({
          moveIndex: nextEntry.moveIndex,
          evaluation: null,
          syncLocal,
        })

        if (persisted instanceof Error) {
          console.warn(persisted)
        }

        arbiterQueue.set(peek(arbiterQueue).slice(1))
        arbiterInFlight.set(null)
        return result
      }

      if (result instanceof Error) {
        console.warn(result)
        const persisted = persistArbiterEvaluation({
          moveIndex: nextEntry.moveIndex,
          evaluation: null,
          syncLocal,
        })

        if (persisted instanceof Error) {
          console.warn(persisted)
        }

        pushArbiterUnavailableWarning(result)
        arbiterQueue.set(peek(arbiterQueue).slice(1))
        arbiterInFlight.set(null)
        continue
      }

      const persisted = persistArbiterEvaluation({
        moveIndex: nextEntry.moveIndex,
        evaluation: result,
        syncLocal,
      })

      if (persisted instanceof Error) {
        console.warn(persisted)
      }

      arbiterWarningShown.set(false)

      if (
        historyCursor() === latestMoveCount() &&
        latestMoveCount() === nextEntry.moveIndex + 1
      ) {
        const createdAt = Date.now()
        arbiterLiveComment.set({
          id: createdAt,
          side: getMoveSide(nextEntry.moveIndex),
          text: result.comment,
          createdAt,
        })
      }

      arbiterQueue.set(peek(arbiterQueue).slice(1))
      arbiterInFlight.set(null)
    }
  }, `${name}.runArbiterQueue`).extend(withAbort())

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

    queueArbiterEvaluation(nextSnapshot.history.length - 1)

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
      startupBlockedConfigSignature.set(null)
      const error = createMissingGameError(gameId)
      runtimeError.set(error)
      phase.setActorError()
      return error
    }

    const currentConfigSignature = JSON.stringify(currentGame.config)

    const nextActors = createSideActors(
      currentGame.config,
      createRuntimeControlsByGroupKey(
        currentGame.config,
        currentGame.actorControls,
      ),
    )

    if (nextActors instanceof Error) {
      startupBlockedConfigSignature.set(
        nextActors instanceof CredentialError ? currentConfigSignature : null,
      )
      runtimeError.set(nextActors)
      phase.setActorError()
      return nextActors
    }

    startupBlockedConfigSignature.set(null)
    actors.set(nextActors)
    arbiterRuntime.set(createConfiguredArbiter(currentGame.config.arbiter ?? null))
    arbiterQueue.set([])
    arbiterInFlight.set(null)
    evaluationsByMove.set([...(currentGame.evaluations ?? [])])
    arbiterLiveComment.set(null)
    arbiterWarningShown.set(false)
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

  effect(() => {
    const currentSignature = storedGameConfigSignature()
    const blockedSignature = startupBlockedConfigSignature()
    const currentPhase = phase()
    const currentError = runtimeError()

    if (
      currentSignature === null ||
      blockedSignature === null ||
      currentSignature === blockedSignature ||
      currentPhase !== 'actorError' ||
      !(currentError instanceof CredentialError)
    ) {
      return
    }

    void startMatch()
  }, `${name}.retryStartupOnCredentialChange`)

  effect(() => {
    vaultSecretsAtom()
    const currentPhase = phase()

    if (currentPhase !== 'playing') return

    const currentGame = peek(storedGameRecordAtom(gameId))
    if (currentGame === null) return

    const arbiterConfig = currentGame.config.arbiter ?? null
    if (arbiterConfig === null) return

    arbiterRuntime.set(createConfiguredArbiter(arbiterConfig))
    arbiterWarningShown.set(false)
  }, `${name}.refreshArbiterOnVaultChange`)

  effect(() => {
    const activity = turnActivity()
    const isAiTurn = activity === 'awaitingActor' && peek(activeHumanActor) === null

    if (!isAiTurn) {
      turnStartedAtAtom.set(null)
      turnElapsedSecondsAtom.set(0)
      return
    }

    const now = Date.now()
    turnStartedAtAtom.set(now)
    turnElapsedSecondsAtom.set(0)

    const intervalId = setInterval(() => {
      const started = peek(turnStartedAtAtom)
      if (started === null) return
      turnElapsedSecondsAtom.set(Math.floor((Date.now() - started) / 1000))
    }, 1000)

    return () => clearInterval(intervalId)
  }, `${name}.turnElapsedTicker`)
  effect(() => {
    if (!isAtLatestMove() && peek(arbiterLiveComment) !== null) {
      arbiterLiveComment.set(null)
    }
  }, `${name}.hideArbiterCommentOffTail`)

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

  const abortCurrentTurn = action(() => {
    const currentSnapshot = snapshot()
    if (turnActivity() !== 'awaitingActor') {
      return null
    }

    runMatchLoop.abort(
      new TurnCancelledError({
        side: currentSnapshot?.turn ?? 'white',
      }),
    )
    return null
  }, `${name}.abortCurrentTurn`)

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
      if (isPromotionMove(currentSnapshot, currentSelectedSquare, square)) {
        pendingPromotion.set({ from: currentSelectedSquare, to: square })
        selectedSquare.set(null)
        return null
      }

      const move: ActorMove = {
        from: currentSelectedSquare,
        to: square,
        promotion: undefined,
        uci: toUciMove(currentSelectedSquare, square, undefined),
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

  const resolvePromotion = action((piece: import('@/domain/chess/types').PromotionPiece) => {
    const pending = peek(pendingPromotion)
    const humanActor = peek(activeHumanActor)

    if (!pending || !humanActor) {
      return null
    }

    pendingPromotion.set(null)

    const move: ActorMove = {
      from: pending.from,
      to: pending.to,
      promotion: piece,
      uci: toUciMove(pending.from, pending.to, piece),
    }

    const result = humanActor.submitMove(move)

    if (result instanceof Error) {
      runtimeError.set(result)
      phase.setActorError()
      return result
    }

    return move
  }, `${name}.resolvePromotion`)

  const cancelPromotion = action(() => {
    pendingPromotion.set(null)
    return null
  }, `${name}.cancelPromotion`)

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
        import('@/shared/ui/Toast').then(({ pushToast }) => {
          pushToast({
            tone: 'error',
            title: 'Match start failed',
            description: startResult.message,
          })
        })
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
    matchInfoEntries,
    arbiterInfoEntry,
    resolvedEvaluation,
    arbiterLiveComment,
    activeActorControls,
    activeHumanActor,
    statusText,
    statusView,
    boardInteractive,
    startMatch,
    retryTurn,
    abortCurrentTurn,
    goToMove,
    goToPreviousMove,
    goToNextMove,
    clickSquare,
    pendingPromotion,
    resolvePromotion,
    cancelPromotion,
    dismissArbiterLiveComment,
    leaveMatch,
    openGames,
    dispose,
  }
}

export type GameModel = ReturnType<typeof createGameModel>
