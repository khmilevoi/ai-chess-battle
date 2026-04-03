import * as errore from 'errore'
import { effect, peek, reatomRoute, urlAtom } from '@reatom/core'
import { Children, Fragment, type ReactNode } from 'react'
import { MatchSetupPage } from '@/features/match-setup/MatchSetupPage'
import { createMatchSetupModel } from '@/features/match-setup/model'
import { GamesPage } from '@/features/games/GamesPage'
import { createGamesModel } from '@/features/games/model'
import { GamePage } from '@/features/game/GamePage'
import { createGameModel } from '@/features/game/model'
import {
  fallbackMatchConfig,
  readStoredMatchConfig,
} from '@/shared/storage/matchConfigStorage'
import {
  activeGameIdAtom,
  activeStoredGameSummaryAtom,
  ensureStoredGameArchiveInitialized,
  readStoredGameRecord,
  readStoredGameSummary,
  setActiveGameId,
} from '@/shared/storage/gameSessionStorage'
import { Button } from '@/shared/ui/Button'
import { CredentialVaultControl } from './CredentialVaultControl'
import styles from './App.module.css'

function renderOutletChildren(outlet: () => ReactNode) {
  return Children.map(outlet(), (child, index) => (
    <Fragment key={`route-outlet-${index}`}>{child}</Fragment>
  ))
}

export const rootRoute = reatomRoute({
  render({ outlet }) {
    const content = renderOutletChildren(outlet)
    const pathname = urlAtom().pathname
    const activeGameSummary = activeStoredGameSummaryAtom()

    return (
      <div className={styles.shell}>
        <div className={styles.content}>
          <header className={styles.masthead}>
            <div className={styles.headerColumn}>
              <div className={styles.brand}>
                <h1 className={styles.name}>AI Chess Battle</h1>
              </div>
              <CredentialVaultControl />
            </div>
            <nav className={styles.nav} aria-label="Primary">
              <Button
                className={[
                  styles.navButton,
                  pathname === '/' ? styles.navButtonActive : '',
                ].join(' ')}
                aria-current={pathname === '/' ? 'page' : undefined}
                onClick={() => {
                  setupRoute.go(undefined, true)
                }}
              >
                Setup
              </Button>
              <Button
                className={[
                  styles.navButton,
                  pathname === '/games' ? styles.navButtonActive : '',
                ].join(' ')}
                aria-current={pathname === '/games' ? 'page' : undefined}
                onClick={() => {
                  gamesRoute.go(undefined, true)
                }}
              >
                Games
              </Button>
              {activeGameSummary ? (
                <Button
                  className={[
                    styles.navButton,
                    pathname === `/game/${activeGameSummary.id}`
                      ? styles.navButtonActive
                      : '',
                  ].join(' ')}
                  aria-current={
                    pathname === `/game/${activeGameSummary.id}` ? 'page' : undefined
                  }
                  onClick={() => {
                    gameRoute.go({ gameId: activeGameSummary.id }, true)
                  }}
                >
                  Active game
                </Button>
              ) : null}
            </nav>
          </header>
          {(content?.length ?? 0) > 0 ? (
            content
          ) : (
            <div className={styles.routePlaceholder}>Redirecting…</div>
          )}
        </div>
      </div>
    )
  },
}, 'routes.root')

export const setupRoute = rootRoute.reatomRoute({
  path: '',
  exactRender: true,
  async loader() {
    const activeGameId = peek(activeGameIdAtom)
    const activeGameSummary = peek(activeStoredGameSummaryAtom)

    if (activeGameId !== null && activeGameSummary === null) {
      setActiveGameId(null)
    }

    const initialConfig = readStoredMatchConfig() ?? fallbackMatchConfig()

    return createMatchSetupModel({
      name: 'setupRoute.model',
      initialConfig,
      goToGame: (gameId) => {
        gameRoute.go({ gameId }, true)
      },
      goToGames: () => {
        gamesRoute.go(undefined, true)
      },
    })
  },
  render(self) {
    if (!self.loader.ready()) {
      return <div>Loading setup...</div>
    }

    const model = self.loader.data()

    if (!model) {
      return <div>Loading setup...</div>
    }

    return <MatchSetupPage model={model} />
  },
}, 'routes.setup')

export const gamesRoute = rootRoute.reatomRoute({
  path: 'games',
  exactRender: true,
  async loader() {
    return createGamesModel({
      goToGame: (gameId) => {
        gameRoute.go({ gameId }, true)
      },
      goToSetup: () => {
        setupRoute.go(undefined, true)
      },
    })
  },
  render(self) {
    if (!self.loader.ready()) {
      return <div>Loading games...</div>
    }

    const model = self.loader.data()

    if (!model) {
      return <div>Loading games...</div>
    }

    return <GamesPage model={model} />
  },
}, 'routes.games')

export const gameRoute = rootRoute.reatomRoute({
  path: 'game/:gameId',
  exactRender: true,
  async loader({ gameId }) {
    try {
      const record = readStoredGameRecord(gameId)

      if (record === null) {
        gamesRoute.go(undefined, true)
        return null
      }

      const summary = readStoredGameSummary(gameId)

      if (summary === null) {
        if (peek(activeGameIdAtom) === gameId) {
          setActiveGameId(null)
        }
        gamesRoute.go(undefined, true)
        return null
      }

      if (!summary.isFinished) {
        setActiveGameId(gameId)
      }

      const model = createGameModel({
        name: 'gameRoute.model',
        gameId,
        startOnConnect: true,
        leaveToSetup: () => {
          setupRoute.go(undefined, true)
        },
        leaveToGames: () => {
          gamesRoute.go(undefined, true)
        },
      })

      return model
    } catch (error) {
      if (errore.isAbortError(error)) {
        return null
      }

      throw error
    }
  },
  render(self) {
    const model = self.loader.data()

    if (
      model == null ||
      (model.snapshot() === null &&
        model.phase() === 'pending' &&
        model.runtimeError() === null)
    ) {
      return <div>Loading match...</div>
    }

    return <GamePage model={model} />
  },
}, 'routes.game')

effect(() => {
  ensureStoredGameArchiveInitialized()
  const currentUrl = urlAtom()

  if (currentUrl.pathname !== '/game') {
    return
  }

  gamesRoute.go(undefined, true)
}, 'routes.redirectIncompleteGamePath')
