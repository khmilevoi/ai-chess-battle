import * as errore from 'errore'
import { abortVar, action, effect, reatomRoute, urlAtom } from '@reatom/core'
import { Children, Fragment, type ReactNode } from 'react'
import { matchSessionConfig } from './model'
import { MatchSetupPage } from '../features/match-setup/MatchSetupPage'
import { createMatchSetupModel } from '../features/match-setup/model'
import { GamePage } from '../features/game/GamePage'
import { createGameModel } from '../features/game/model'
import {
  fallbackMatchConfig,
  readStoredMatchConfig,
} from '../shared/storage/matchConfigStorage'
import {
  clearStoredGameSession,
  readStoredGameSession,
  summarizeStoredGameSession,
} from '../shared/storage/gameSessionStorage'
import styles from './App.module.css'

function renderOutletChildren(outlet: () => ReactNode) {
  return Children.map(outlet(), (child, index) => (
    <Fragment key={`route-outlet-${index}`}>{child}</Fragment>
  ))
}

export const rootRoute = reatomRoute({
  render({ outlet }) {
    const content = renderOutletChildren(outlet)

    return (
      <div className={styles.shell}>
        <div className={styles.content}>
          <header className={styles.masthead}>
            <div className={styles.brand}>
              <p className={styles.tagline}>React / Reatom / chess.js / errore</p>
              <h1 className={styles.name}>AI Chess Battle</h1>
            </div>
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
    const loadedConfig = readStoredMatchConfig()
    const storedGameSession = readStoredGameSession()
    const initialConfig = loadedConfig === null ? fallbackMatchConfig() : loadedConfig
    const activeGameSummary = (() => {
      if (storedGameSession === null) {
        return null
      }

      const summary = summarizeStoredGameSession(storedGameSession)

      if (!(summary instanceof Error)) {
        return summary
      }

      console.warn(summary)
      clearStoredGameSession()
      matchSessionConfig.set(null)

      return null
    })()

    const model = createMatchSetupModel({
      name: 'setupRoute.model',
      initialConfig,
      activeGameSummary,
      startSession: (config) => matchSessionConfig.set(config),
      goToGame: (config) => {
        gameRoute.go({ config }, true)
      },
      resumeMatch: (config) => {
        matchSessionConfig.set(config)
        gameRoute.go({ config }, true)
      },
    })
    return model
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

const sessionRoute = rootRoute.reatomRoute({
  params() {
    const config = matchSessionConfig()
    
    if (config) {
      return { config }
    }

    if (!setupRoute.match()) {
      setupRoute.go(undefined, true)
    }

    return null
  },
  render({ outlet }) {
    return <>{renderOutletChildren(outlet)}</>
  },
}, 'routes.session')

export const gameRoute = sessionRoute.reatomRoute({
  path: 'game',
  exactRender: true,
  async loader({ config }) {
    try {
      const storedGameSession = readStoredGameSession()
      const initialSession = storedGameSession === null ? null : storedGameSession
      const model = createGameModel({
        name: 'gameRoute.model',
        config,
        initialSession,
        leaveToSetup: () => {
          matchSessionConfig.set(null)
          setupRoute.go(undefined, true)
        },
      })

      const cleanup = action(() => {
        model.dispose()
        return null
      }, 'routes.game.cleanup')

      abortVar.subscribe(() => {
        abortVar.spawn(cleanup)
      })

      void model.startMatch().then((startResult) => {
        if (!(startResult instanceof Error)) {
          return
        }

        console.warn(startResult)
        clearStoredGameSession()
        matchSessionConfig.set(null)
        cleanup()
        setupRoute.go(undefined, true)
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

    if (model == null || model.snapshot() === null) {
      return <div>Loading match...</div>
    }

    return <GamePage model={model} />
  },
}, 'routes.game')

effect(() => {
  const currentUrl = urlAtom()

  if (currentUrl.pathname !== '/game') {
    return
  }

  if (matchSessionConfig() !== null) {
    return
  }

  setupRoute.go(undefined, true)
}, 'routes.redirectMissingGameSession')
