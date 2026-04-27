# Link Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inline `<a>` tags in the root nav with a reusable `<Link>` component, collapse `RootShell.ts` + `RootShellView.tsx` into one file, and drop the navigation-callback props from the root shell.

**Architecture:** A stateless `Link` component renders an `<a>` with `href`, optional active class, and `aria-current`. Navigation is handled globally by `urlAtom.catchLinks` — no `onClick` needed. `RootShell.tsx` becomes one file that wraps itself in `reatomMemo` and imports route atoms directly from `routes.tsx` (circular import is ESM-safe at render time; TODO comment added for future cleanup).

**Tech Stack:** React 19, TypeScript, Reatom (`@reatom/core`), clsx, Vitest + @testing-library/react

---

## File Map

| Action | Path |
|--------|------|
| Create | `src/shared/ui/Link.tsx` |
| Create | `src/shared/ui/Link.test.tsx` |
| Create | `src/app/RootShell.tsx` (replaces both files below) |
| Modify | `src/app/routes.tsx` |
| Delete | `src/app/RootShell.ts` |
| Delete | `src/app/RootShellView.tsx` |

---

## Task 1: Link component

**Files:**
- Create: `src/shared/ui/Link.test.tsx`
- Create: `src/shared/ui/Link.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/shared/ui/Link.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Link } from './Link'

describe('Link', () => {
  it('renders an anchor with href', () => {
    render(<Link path="/games">Games</Link>)
    expect(screen.getByRole('link', { name: 'Games' })).toHaveAttribute('href', '/games')
  })

  it('applies the default class', () => {
    render(
      <Link path="/games" classes={{ default: 'nav-btn' }}>
        Games
      </Link>,
    )
    expect(screen.getByRole('link', { name: 'Games' })).toHaveClass('nav-btn')
  })

  it('applies active class and aria-current when match is true', () => {
    render(
      <Link path="/games" match classes={{ default: 'nav-btn', active: 'nav-btn-active' }}>
        Games
      </Link>,
    )
    const link = screen.getByRole('link', { name: 'Games' })
    expect(link).toHaveClass('nav-btn', 'nav-btn-active')
    expect(link).toHaveAttribute('aria-current', 'page')
  })

  it('omits active class and aria-current when match is false', () => {
    render(
      <Link path="/games" match={false} classes={{ default: 'nav-btn', active: 'nav-btn-active' }}>
        Games
      </Link>,
    )
    const link = screen.getByRole('link', { name: 'Games' })
    expect(link).not.toHaveClass('nav-btn-active')
    expect(link).not.toHaveAttribute('aria-current')
  })

  it('omits aria-current when match is not provided', () => {
    render(
      <Link path="/" classes={{ default: 'brand-link' }}>
        AI Chess Battle
      </Link>,
    )
    expect(screen.getByRole('link', { name: 'AI Chess Battle' })).not.toHaveAttribute(
      'aria-current',
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
rtk vitest run src/shared/ui/Link.test.tsx
```

Expected: 5 failures — `Cannot find module './Link'` or similar.

- [ ] **Step 3: Implement the Link component**

Create `src/shared/ui/Link.tsx`:

```tsx
import clsx from 'clsx'
import type { ReactNode } from 'react'

type LinkProps = {
  path: string
  match?: boolean
  classes?: { default?: string; active?: string }
  children: ReactNode
}

export function Link({ path, match, classes, children }: LinkProps) {
  return (
    <a
      href={path}
      className={clsx(classes?.default, match && classes?.active)}
      aria-current={match ? 'page' : undefined}
    >
      {children}
    </a>
  )
}
```

Note: no `onClick`. `urlAtom.catchLinks` (enabled by default in reatom) intercepts same-origin left-clicks on the document body, calls `urlAtom.syncFromSource(new URL(link.href))`, and calls `history.pushState`. It already handles Cmd/Ctrl/Shift/Alt-clicks, `target="_blank"`, external origins, and download links — no wrapper needed.

- [ ] **Step 4: Run tests to verify they pass**

```bash
rtk vitest run src/shared/ui/Link.test.tsx
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
rtk git add src/shared/ui/Link.tsx src/shared/ui/Link.test.tsx && rtk git commit -m "feat: add reusable Link component for route navigation"
```

---

## Task 2: Combine RootShell, replace inline anchors, update routes

**Files:**
- Create: `src/app/RootShell.tsx`
- Modify: `src/app/routes.tsx`
- Delete: `src/app/RootShell.ts`
- Delete: `src/app/RootShellView.tsx`

- [ ] **Step 1: Create `src/app/RootShell.tsx`**

This single file replaces both `RootShell.ts` (which only wraps with `reatomMemo`) and `RootShellView.tsx` (which contains the markup). The new file owns both.

```tsx
// TODO: extract route atoms to a separate registry module to break the circular
// import between routes.tsx (which imports RootShell) and this file (which
// imports route atoms from routes.tsx). ESM live bindings make this work today
// because route atoms are only accessed at render time, not at module load time.

import { Children, Fragment, type ReactNode } from 'react'
import clsx from 'clsx'
import { activeStoredGameSummaryAtom } from '@/shared/storage/gameSessionStorage'
import { reatomMemo } from '@/shared/ui/reatomMemo'
import { Link } from '@/shared/ui/Link'
import { SkipLink } from '@/shared/ui/SkipLink'
import { ThemeToggle } from '@/shared/ui/ThemeToggle'
import { ToastViewport } from '@/shared/ui/Toast'
import { CredentialVaultControl } from './CredentialVaultControl'
import { CredentialVaultDialog } from './CredentialVaultDialog'
import { SrAnnouncer } from './SrAnnouncer'
import { ThemeEffect } from './ThemeEffect'
import { setupRoute, gamesRoute, gameRoute } from './routes'
import styles from './App.module.css'

function renderOutletChildren(outlet: () => ReactNode) {
  return Children.map(outlet(), (child, index) => (
    <Fragment key={`route-outlet-${index}`}>{child}</Fragment>
  ))
}

export const RootShell = reatomMemo(function RootShell({
  outlet,
}: {
  outlet: () => ReactNode
}) {
  const content = renderOutletChildren(outlet)
  const activeGameSummary = activeStoredGameSummaryAtom()
  const isGamePage = gameRoute.match()

  return (
    <div className={clsx(styles.shell, isGamePage && styles.gameShell)}>
      <SkipLink />
      <div className={clsx(styles.content, isGamePage && styles.gameContent)}>
        <ThemeEffect />
        <SrAnnouncer />
        <header className={clsx(styles.masthead, isGamePage && styles.gameMasthead)}>
          <div className={styles.headerColumn}>
            <div className={styles.brand}>
              <h1 className={styles.name}>
                <Link path={setupRoute.path()} classes={{ default: styles.brandLink }}>
                  AI Chess Battle
                </Link>
              </h1>
            </div>
            <CredentialVaultControl />
            <ThemeToggle />
          </div>
          <nav className={styles.nav} aria-label="Primary">
            <Link
              path={setupRoute.path()}
              match={setupRoute.exact()}
              classes={{ default: styles.navButton, active: styles.navButtonActive }}
            >
              Setup
            </Link>
            <Link
              path={gamesRoute.path()}
              match={gamesRoute.exact()}
              classes={{ default: styles.navButton, active: styles.navButtonActive }}
            >
              Games
            </Link>
            {activeGameSummary ? (
              <Link
                path={gameRoute.path({ gameId: activeGameSummary.id })}
                match={gameRoute.match()}
                classes={{ default: styles.navButton, active: styles.navButtonActive }}
              >
                Active game
              </Link>
            ) : null}
          </nav>
        </header>
        <main id="main-content">
          {(content?.length ?? 0) > 0 ? (
            content
          ) : (
            <div className={styles.routePlaceholder}>Redirecting...</div>
          )}
        </main>
        <CredentialVaultDialog />
        <ToastViewport />
      </div>
    </div>
  )
}, 'RootShell')
```

- [ ] **Step 2: Update `src/app/routes.tsx` — drop nav callbacks from rootRoute render**

Find this block (lines 23–40) in `src/app/routes.tsx`:

```ts
export const rootRoute = reatomRoute({
  render({ outlet }) {
    return (
      <RootShell
        outlet={outlet}
        goToSetup={() => {
          setupRoute.go(undefined, true)
        }}
        goToGames={() => {
          gamesRoute.go(undefined, true)
        }}
        goToGame={(gameId) => {
          gameRoute.go({ gameId }, true)
        }}
      />
    )
  },
}, 'routes.root')
```

Replace it with:

```ts
export const rootRoute = reatomRoute({
  render({ outlet }) {
    return <RootShell outlet={outlet} />
  },
}, 'routes.root')
```

The three navigation closures (`goToSetup`, `goToGames`, `goToGame`) only existed to forward route navigations into the shell. The shell now imports routes directly, so they are no longer needed here. The existing closures in the `setupRoute`, `gamesRoute`, and `gameRoute` loaders (`goToGame`, `goToSetup`, `leaveToSetup`, etc.) are unrelated and must be left untouched.

- [ ] **Step 3: Delete the old files**

```bash
rtk git rm src/app/RootShell.ts src/app/RootShellView.tsx
```

At this point `import { RootShell } from './RootShell'` in `routes.tsx` resolves to the new `RootShell.tsx` (TypeScript prefers `.tsx` when `.ts` is gone).

- [ ] **Step 4: Run the full test suite**

```bash
rtk vitest run
```

Expected: all tests pass (same count as before). The integration tests in `src/app/App.test.tsx` cover the nav links end-to-end:
- `getByRole('link', { name: 'AI Chess Battle' })` with `href="/"`
- `getByRole('link', { name: 'Setup' })` with `href="/"`
- `getByRole('link', { name: 'Games' })` with `href="/games"`
- Active game link with correct `href`
- Clicking nav links and asserting URL/page state changes

If any test fails: the most likely causes are (a) a prop name typo in the `<RootShell outlet={outlet} />` call, or (b) a missing import in `RootShell.tsx`.

- [ ] **Step 5: Run lint**

```bash
rtk pnpm lint
```

Expected: no errors. If TypeScript reports an error about `catchLinks` or `match` being undefined, verify the import of `gameRoute` and `setupRoute` from `./routes` is correct.

- [ ] **Step 6: Commit**

```bash
rtk git add src/app/RootShell.tsx src/app/routes.tsx && rtk git commit -m "refactor: collapse RootShell into one file, replace inline anchors with Link"
```
