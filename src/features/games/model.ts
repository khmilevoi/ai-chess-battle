import { action, atom, computed, peek } from '@reatom/core'
import {
  activeGameIdAtom,
  deleteStoredGameRecord,
  saveStoredGameRecord,
  setActiveGameId,
  storedGameSummariesAtom,
  type StoredGameRecord,
  type StoredGameSummary,
} from '@/shared/storage/gameSessionStorage'

export type GamesFilterStatus = 'all' | 'in-progress' | 'finished'
export type GamesSortKey = 'updated' | 'created' | 'moves' | 'status'

type CreateGamesModelOptions = {
  goToGame: (gameId: string) => void
  goToSetup: () => void
}

export function createGamesModel({
  goToGame,
  goToSetup,
}: CreateGamesModelOptions) {
  const activeGameId = activeGameIdAtom

  const filterStatusAtom = atom<GamesFilterStatus>('all', 'gamesModel.filterStatus')
  const sortKeyAtom = atom<GamesSortKey>('updated', 'gamesModel.sortKey')
  const searchQueryAtom = atom<string>('', 'gamesModel.searchQuery')

  const recentlyDeletedAtom = atom<{ record: StoredGameRecord; summary: StoredGameSummary } | null>(
    null,
    'gamesModel.recentlyDeleted',
  )

  const filteredGameSummaries = computed(() => {
    const all = storedGameSummariesAtom()
    const filter = filterStatusAtom()
    const sort = sortKeyAtom()
    const query = searchQueryAtom().trim().toLowerCase()

    let result = all

    if (filter === 'in-progress') {
      result = result.filter((g) => !g.isFinished)
    } else if (filter === 'finished') {
      result = result.filter((g) => g.isFinished)
    }

    if (query.length > 0) {
      result = result.filter((g) => {
        const actorString = `${g.config.white.actorKey} ${g.config.black.actorKey}`.toLowerCase()
        return actorString.includes(query) || g.statusText.toLowerCase().includes(query)
      })
    }

    return [...result].sort((a, b) => {
      switch (sort) {
        case 'created':
          return b.createdAt - a.createdAt
        case 'moves':
          return b.moveCount - a.moveCount
        case 'status':
          return Number(a.isFinished) - Number(b.isFinished)
        case 'updated':
        default:
          return b.updatedAt - a.updatedAt
      }
    })
  }, 'gamesModel.filteredGameSummaries')

  const openGame = action((gameId: string) => {
    const summary = storedGameSummariesAtom().find((game) => game.id === gameId)

    if (!summary) {
      return null
    }

    if (!summary.isFinished) {
      setActiveGameId(summary.id)
    }

    goToGame(summary.id)
    return summary.id
  }, 'gamesModel.openGame')

  const deleteGame = action((gameId: string) => {
    const summary = storedGameSummariesAtom().find((g) => g.id === gameId)
    const record = deleteStoredGameRecord(gameId)

    if (record && summary) {
      recentlyDeletedAtom.set({ record, summary })

      import('@/shared/ui/Toast').then(({ pushToast, dismissToast }) => {
        const toastId = pushToast({
          tone: 'neutral',
          title: 'Game deleted',
          description: `${summary.config.white.actorKey} vs ${summary.config.black.actorKey}`,
          actionLabel: 'Undo',
          duration: 6000,
          onAction: () => {
            const deleted = peek(recentlyDeletedAtom)
            if (deleted?.record.id === gameId) {
              saveStoredGameRecord(deleted.record)
              recentlyDeletedAtom.set(null)
            }
            dismissToast(toastId)
          },
        })
      })
    }

    return record
  }, 'gamesModel.deleteGame')

  const openSetup = action(() => {
    goToSetup()
    return null
  }, 'gamesModel.openSetup')

  return {
    activeGameId,
    filteredGameSummaries,
    filterStatusAtom,
    sortKeyAtom,
    searchQueryAtom,
    recentlyDeletedAtom,
    openGame,
    deleteGame,
    openSetup,
  }
}

export type GamesModel = ReturnType<typeof createGamesModel>
