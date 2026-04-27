# Reusable `<Link>` component for route navigation

Date: 2026-04-27

## Goal

Replace inline `<a>` tags in `RootShellView` with a reusable `<Link>` component that takes a route's path string and current match state. Drop the navigation callback props (`goToSetup`, `goToGames`, `goToGame`) from the root shell — it imports the route atoms directly. Collapse the `RootShell` / `RootShellView` split into a single file.

## Background

Today, `RootShellView` renders four `<a>` tags (one brand link plus three nav buttons). Each one:

- builds its `href` by hand
- duplicates the modifier-key click guard via a local `handleAppLinkClick` helper
- receives a navigation callback (`goToSetup`, `goToGames`, `goToGame`) through props from `routes.tsx`
- joins `className` strings with `[...].join(' ')`

This produces a lot of repetition for what is the same pattern: render a link to a known route. Reatom's `urlAtom.catchLinks` already intercepts `<a>` clicks at the document body, performs SPA navigation, and respects modifier keys — so a wrapper component only needs to render the right `href`.

## Non-goals

- No change to existing routes or to how match/exact computed atoms work.
- No new abstraction over `RouteAtom`. The Link is decoupled from routes — caller passes plain `path` and `match` values.
- No refactor of unrelated nav/header markup.

## Component API

`src/shared/ui/Link.tsx`:

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

Notes:

- No `onClick`. `urlAtom.catchLinks` (enabled by default in reatom) intercepts left-clicks at the document body, calls `urlAtom.syncFromSource(new URL(link.href))`, and pushes history. It already respects Cmd/Ctrl/Shift/Alt-clicks, `target="_blank"`, external origins, `rel="external"`, `rel="nofollow"`, and `download`.
- `aria-current="page"` is applied iff `match` is truthy. Brand link omits `match`, so it never gets `aria-current` (preserves current behavior).
- `className` is built with `clsx` — never include the active class when `match` is `false`.

## Active-state matching strategy

Caller chooses `route.match()` or `route.exact()`:

- Setup nav button → `setupRoute.exact()`. (`setupRoute.match()` would always be true because the path is `''`.)
- Games nav button → `gamesRoute.exact()` (matches `/games` only).
- Active-game nav button → `gameRoute.match()` (matches `/game/:gameId`).
- Brand link → `match` omitted (never highlighted).

## File changes

### New: `src/shared/ui/Link.tsx`

The `Link` component above.

### Replaced: `src/app/RootShell.tsx`

Collapses `src/app/RootShell.ts` + `src/app/RootShellView.tsx` into one file. The function is wrapped in `reatomMemo` directly. Top of file gets a TODO note about the circular import:

```tsx
// TODO: extract route atoms (setupRoute, gamesRoute, gameRoute) to a separate
// registry module to break the circular import between routes.tsx and RootShell.tsx.
```

The component:

- accepts only `{ outlet: () => ReactNode }`
- imports `setupRoute`, `gamesRoute`, `gameRoute` from `./routes`
- replaces all four `<a>` tags with `<Link>` (brand, Setup, Games, Active game)
- uses `gameRoute.match()` for `isGamePage` instead of `pathname.startsWith('/game/')`
- replaces `[...].join(' ')` with `clsx` for `mastheadClassName`, the shell `div`, and the content `div`
- drops the local `handleAppLinkClick` helper and the `urlAtom`/`MouseEvent` imports tied to it

### Updated: `src/app/routes.tsx`

`rootRoute.render` becomes:

```ts
render({ outlet }) {
  return <RootShell outlet={outlet} />
}
```

The three navigation closures (`goToSetup`, `goToGames`, `goToGame`) are removed from the `<RootShell>` props — they remain on the per-route loader closures (`setupRoute` / `gamesRoute` / `gameRoute` loaders) where they're still used to navigate after side effects (e.g., starting a match).

### Deleted

- `src/app/RootShellView.tsx`
- `src/app/RootShell.ts`

`src/app/RootShell.tsx` replaces both.

## Tests

`src/app/App.test.tsx` already covers nav behavior end-to-end:

- `getByRole('link', { name: 'Setup' })` and `getByRole('link', { name: 'Games' })` with `href` assertions.
- `getByRole('link', { name: 'AI Chess Battle' })` with `href="/"`.
- Click flows that navigate via the nav links and assert URL/page state.

These should continue to pass without modification. We rely on the existing integration coverage rather than adding a unit test for Link, since the component is trivial and the App integration tests already exercise its rendering, active state, and navigation.

## Risk: circular import

`routes.tsx` imports `RootShell`. `RootShell.tsx` imports `setupRoute`, `gamesRoute`, `gameRoute` from `routes.tsx`. ESM live bindings make this work because the route atoms are only accessed at render time, not at module load time. A TODO comment is added in `RootShell.tsx` to extract route atoms to a separate registry module in a future change.

## Implementation order

1. Add `src/shared/ui/Link.tsx`.
2. Create `src/app/RootShell.tsx` (combined file using `Link` + direct route imports + `reatomMemo`).
3. Update `src/app/routes.tsx` to drop the navigation callbacks from the root render.
4. Delete `src/app/RootShellView.tsx` and `src/app/RootShell.ts`.
5. Run `pnpm lint` and `pnpm test` to verify.
