import { action } from '@reatom/core'
import {
  activeGameIdAtom,
  setActiveGameId,
  storedGameSummariesAtom,
} from '@/shared/storage/gameSessionStorage'

type CreateGamesModelOptions = {
  goToGame: (gameId: string) => void
  goToSetup: () => void
}

export function createGamesModel({
  goToGame,
  goToSetup,
}: CreateGamesModelOptions) {
  const gameSummaries = storedGameSummariesAtom
  const activeGameId = activeGameIdAtom

  const openGame = action((gameId: string) => {
    const summary = gameSummaries().find((game) => game.id === gameId)

    if (!summary) {
      return null
    }

    if (!summary.isFinished) {
      setActiveGameId(summary.id)
    }

    goToGame(summary.id)
    return summary.id
  }, 'gamesModel.openGame')

  const openSetup = action(() => {
    goToSetup()
    return null
  }, 'gamesModel.openSetup')

  return {
    gameSummaries,
    activeGameId,
    openGame,
    openSetup,
  }
}

export type GamesModel = ReturnType<typeof createGamesModel>
