import { urlAtom } from '@reatom/core'
import { Children, Fragment, type ReactNode } from 'react'
import { activeStoredGameSummaryAtom } from '@/shared/storage/gameSessionStorage'
import { Button } from '@/shared/ui/Button'
import { SkipLink } from '@/shared/ui/SkipLink'
import { ThemeToggle } from '@/shared/ui/ThemeToggle'
import { ToastViewport } from '@/shared/ui/Toast'
import { CredentialVaultControl } from './CredentialVaultControl'
import { CredentialVaultDialog } from './CredentialVaultDialog'
import { openPreferencesDialog, PreferencesDialog } from './PreferencesDialog'
import { SrAnnouncer } from './SrAnnouncer'
import { ThemeEffect } from './ThemeEffect'
import styles from './App.module.css'

export type RootShellProps = {
  outlet: () => ReactNode
  goToSetup: () => void
  goToGames: () => void
  goToGame: (gameId: string) => void
}

function renderOutletChildren(outlet: () => ReactNode) {
  return Children.map(outlet(), (child, index) => (
    <Fragment key={`route-outlet-${index}`}>{child}</Fragment>
  ))
}

export function RootShellView({
  outlet,
  goToSetup,
  goToGames,
  goToGame,
}: RootShellProps) {
  const content = renderOutletChildren(outlet)
  const pathname = urlAtom().pathname
  const activeGameSummary = activeStoredGameSummaryAtom()
  const isGamePage = pathname.startsWith('/game/')
  const mastheadClassName = [
    styles.masthead,
    isGamePage ? styles.gameMasthead : '',
  ].join(' ')
  const mastheadContent = (
    <>
      <div className={styles.headerColumn}>
        <div className={styles.brand}>
          <h1 className={styles.name}>AI Chess Battle</h1>
        </div>
        <CredentialVaultControl />
        <ThemeToggle />
        <Button
          className={styles.prefsButton}
          aria-label="Open preferences"
          title="Preferences"
          onClick={() => openPreferencesDialog()}
        >
          ⚙
        </Button>
      </div>
      <nav className={styles.nav} aria-label="Primary">
        <Button
          className={[
            styles.navButton,
            pathname === '/' ? styles.navButtonActive : '',
          ].join(' ')}
          aria-current={pathname === '/' ? 'page' : undefined}
          onClick={goToSetup}
        >
          Setup
        </Button>
        <Button
          className={[
            styles.navButton,
            pathname === '/games' ? styles.navButtonActive : '',
          ].join(' ')}
          aria-current={pathname === '/games' ? 'page' : undefined}
          onClick={goToGames}
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
              goToGame(activeGameSummary.id)
            }}
          >
            Active game
          </Button>
        ) : null}
      </nav>
    </>
  )
  const routeContent =
    (content?.length ?? 0) > 0 ? (
      content
    ) : (
      <div className={styles.routePlaceholder}>Redirecting...</div>
    )

  return (
    <div className={[styles.shell, isGamePage ? styles.gameShell : ''].join(' ')}>
      <SkipLink />
      <div className={[styles.content, isGamePage ? styles.gameContent : ''].join(' ')}>
        <ThemeEffect />
        <SrAnnouncer />
        <header className={mastheadClassName}>{mastheadContent}</header>
        <main id="main-content">
          {routeContent}
        </main>
        <CredentialVaultDialog />
        <PreferencesDialog />
        <ToastViewport />
      </div>
    </div>
  )
}
