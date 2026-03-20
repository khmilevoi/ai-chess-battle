import * as errore from 'errore'
import { abortVar, action, reatomRoute } from '@reatom/core'
import { matchSessionConfig } from './model'
import { MatchSetupPage } from '../features/match-setup/MatchSetupPage'
import { createMatchSetupModel } from '../features/match-setup/model'
import { GamePage } from '../features/game/GamePage'
import { createGameModel } from '../features/game/model'
import {
  fallbackMatchConfig,
  loadStoredMatchConfig,
} from '../shared/storage/matchConfigStorage'
import styles from './App.module.css'

export const rootRoute = reatomRoute({
  render({ outlet }) {
    return (
      <div className={styles.shell}>
        <div className={styles.content}>
          <header className={styles.masthead}>
            <div className={styles.brand}>
              <p className={styles.tagline}>React / Reatom / chess.js / errore</p>
              <h1 className={styles.name}>AI Chess Battle</h1>
            </div>
          </header>
          {outlet()}
        </div>
      </div>
    )
  },
}, 'routes.root')

export const setupRoute = rootRoute.reatomRoute({
  path: '',
  exactRender: true,
  async loader() {
    const loadedConfig = loadStoredMatchConfig()
    const initialConfig =
      loadedConfig instanceof Error || loadedConfig === null
        ? fallbackMatchConfig()
        : loadedConfig

    if (loadedConfig instanceof Error) {
      console.warn(loadedConfig)
    }

    const model = createMatchSetupModel({
      name: 'setupRoute.model',
      initialConfig,
      startSession: (config) => matchSessionConfig.set(config),
      goToGame: (config) => {
        gameRoute.go({ config }, true)
      },
    })

    if (loadedConfig instanceof Error) {
      model.setupError.set(loadedConfig)
    }

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
    return <>{outlet()}</>
  },
}, 'routes.session')

export const gameRoute = sessionRoute.reatomRoute({
  path: 'game',
  exactRender: true,
  async loader({ config }) {
    try {
      const model = createGameModel({
        name: 'gameRoute.model',
        config,
        leaveToSetup: () => {
          matchSessionConfig.set(null)
          setupRoute.go(undefined, true)
        },
      })

      const cleanup = action(() => {
        model.dispose()
        matchSessionConfig.set(null)
        return null
      }, 'routes.game.cleanup')

      abortVar.subscribe(() => {
        abortVar.spawn(cleanup)
      })

      const startResult = await model.startMatch()

      if (startResult instanceof Error) {
        console.warn(startResult)
        cleanup()
        setupRoute.go(undefined, true)
        return null
      }

      return model
    } catch (error) {
      if (errore.isAbortError(error)) {
        return null
      }

      throw error
    }
  },
  render(self) {
    if (!self.loader.ready()) {
      return <div>Loading match...</div>
    }

    const model = self.loader.data()

    if (model == null) {
      return <></>
    }

    return <GamePage model={model} />
  },
}, 'routes.game')
