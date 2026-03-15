import { useEffect } from 'react'
import { urlAtom } from '@reatom/core'
import { useAtom } from '@reatom/react'
import { MatchSetupPage } from '../features/match-setup/MatchSetupPage'
import { GamePage } from '../features/game/GamePage'
import { gameRoute, setupRoute } from './routes'
import styles from './App.module.css'

export function App() {
  const [url] = useAtom(urlAtom)
  const [isSetup] = useAtom(setupRoute.match)
  const [isGame] = useAtom(gameRoute.match)

  useEffect(() => {
    if (url.pathname === '/') {
      setupRoute.go(undefined, true)
    }
  }, [url.pathname])

  return (
    <div className={styles.shell}>
      <div className={styles.content}>
        <header className={styles.masthead}>
          <div className={styles.brand}>
            <p className={styles.tagline}>React / Reatom / chess.js / errore</p>
            <h1 className={styles.name}>AI Chess Battle</h1>
          </div>
        </header>

        {isSetup ? <MatchSetupPage /> : null}
        {isGame ? <GamePage /> : null}
        {!isSetup && !isGame ? <MatchSetupPage /> : null}
      </div>
    </div>
  )
}
