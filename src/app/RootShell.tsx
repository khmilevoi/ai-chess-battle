// TODO: extract route atoms to a separate registry module to break the circular
// import between routes.tsx (which imports RootShell) and this file (which
// imports route atoms from routes.tsx). ESM live bindings make this work today
// because route atoms are only accessed at render time, not at module load time.

import {type ReactNode} from 'react'
import clsx from 'clsx'
import {activeStoredGameSummaryAtom} from '@/shared/storage/gameSessionStorage'
import {reatomMemo} from '@/shared/ui/reatomMemo'
import {Link} from '@/shared/ui/Link'
import {SkipLink} from '@/shared/ui/SkipLink'
import {ThemeToggle} from '@/shared/ui/ThemeToggle'
import {ToastViewport} from '@/shared/ui/Toast'
import {CredentialVaultControl} from './CredentialVaultControl'
import {CredentialVaultDialog} from './CredentialVaultDialog'
import {SrAnnouncer} from './SrAnnouncer'
import {ThemeEffect} from './ThemeEffect'
import {setupRoute, gamesRoute, gameRoute} from './routes'
import styles from './App.module.css'

export const RootShell = reatomMemo(function RootShell({
                                                         children,
                                                       }: {
  children: ReactNode[]
}) {
  const activeGameSummary = activeStoredGameSummaryAtom()
  const isGamePage = gameRoute.match()

  return (
    <div className={clsx(styles.shell, isGamePage && styles.gameShell)}>
      <SkipLink/>
      <div className={clsx(styles.content, isGamePage && styles.gameContent)}>
        <ThemeEffect/>
        <SrAnnouncer/>
        <header className={clsx(styles.masthead, isGamePage && styles.gameMasthead)}>
          <div className={styles.headerColumn}>
            <div className={styles.brand}>
              <h1 className={styles.name}>
                <Link path={setupRoute.path()} classes={{default: styles.brandLink}}>
                  AI Chess Battle
                </Link>
              </h1>
            </div>
            <CredentialVaultControl/>
            <ThemeToggle/>
          </div>
          <nav className={styles.nav} aria-label="Primary">
            <Link
              path={setupRoute.path()}
              match={setupRoute.exact()}
              classes={{default: styles.navButton, active: styles.navButtonActive}}
            >
              Setup
            </Link>
            <Link
              path={gamesRoute.path()}
              match={gamesRoute.exact()}
              classes={{default: styles.navButton, active: styles.navButtonActive}}
            >
              Games
            </Link>
            {activeGameSummary ? (
              <Link
                path={gameRoute.path({gameId: activeGameSummary.id})}
                match={gameRoute.match()}
                classes={{default: styles.navButton, active: styles.navButtonActive}}
              >
                Active game
              </Link>
            ) : null}
          </nav>
        </header>
        <main id="main-content">
          {(children.length) > 0 ? (
            children
          ) : (
            <div className={styles.routePlaceholder}>Redirecting...</div>
          )}
        </main>
        <CredentialVaultDialog/>
        <ToastViewport/>
      </div>
    </div>
  )
}, 'RootShell')
