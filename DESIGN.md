# DESIGN.md — AI Chess Battle

**Pure monochrome neo-brutalism. A reference spec for the visual system.**

Last updated: 2026-04-28

This document defines the target design system for AI Chess Battle: principles, design tokens, components, and patterns. It is the authoritative reference. Where the running app diverges from this spec — toast hues, multiple board themes, accent colors — the divergence is documented in the [Migration Notes](#11-migration-notes) appendix and is to be eliminated.

The implementation lives in [src/index.css](src/index.css) (tokens) and `*.module.css` files (components). Every value in this document is either present in those files today or listed in Migration Notes as work to do.

---

## Table of Contents

1. [Principles](#1-principles)
2. [Voice & Tone](#2-voice--tone)
3. [Foundations](#3-foundations)
4. [Stateful Expression Without Color](#4-stateful-expression-without-color)
5. [Components](#5-components)
6. [Game-Specific Components](#6-game-specific-components)
7. [Patterns](#7-patterns)
8. [Accessibility](#8-accessibility)
9. [Theming](#9-theming)
10. [Browser Support & Reduced Motion](#10-browser-support--reduced-motion)
11. [Migration Notes](#11-migration-notes)

---

## 1. Principles

The creed. If a design choice does not pass all seven, it is wrong.

1. **Edges, not corners.** `border-radius: 0` everywhere. Squares, hard rectangles, right angles.
2. **Hard shadows only.** Solid offset, zero blur. Down-and-right. Two sizes: `6px 6px 0` and `10px 10px 0`.
3. **Ink, paper, and the grays between.** No hue, ever. State is communicated by structure, type, and pattern — never by color.
4. **Type carries the brand.** Display serif (`Iowan Old Style`) for hierarchy. Mono (`IBM Plex Mono`) for data, IDs, and labels. Sans (`Segoe UI`) for body. Use weights `500`, `600`, `700`. Italics are forbidden.
5. **Motion is feedback, not decoration.** `80ms ease-out`. Press translates down-and-right. Hover lifts shadow. No fade, no slide, no spring.
6. **Borders mean something.** `2px solid` is the container default. `4px solid` is emphasis. `2px dashed` marks empty states or focus. Anything else needs justification.
7. **Density over whitespace.** Information packs tight. Use spacing tokens; do not invent gaps. The dotted background grid is part of the canvas, not a decoration.

---

## 2. Voice & Tone

UI copy is terse, declarative, and uppercase for actions.

| Surface | Casing | Example |
|---|---|---|
| Button labels | UPPERCASE | `START MATCH`, `RESIGN`, `DISMISS` |
| Section titles (`h1`, `h2`) | Sentence case, display serif | `Saved games`, `New match` |
| Eyebrows / metadata labels | UPPERCASE mono | `MOVE 12`, `WHITE TO MOVE`, `OPENAI · GPT-5` |
| Body copy | Sentence case, sans | `No games yet. Start a new match.` |
| Status prefixes | UPPERCASE mono, ends with `·` | `OK · Move accepted`, `ALERT · API key missing` |
| Errors | Imperative, no apology | `Provide an API key.` not `We're sorry, but…` |

**Rules:**
- No exclamation marks.
- No emoji in product copy. (Lucide line icons only.)
- Numbers are arabic, monospaced when displayed.
- Dates are `YYYY-MM-DD`. Times are 24-hour.
- AI provider and model names render in their canonical form (`OpenAI`, `Anthropic`, `Google`, `gpt-5`, `claude-opus-4-7`, `gemini-2.5-pro`).

---

## 3. Foundations

### 3.1 Color — Monochrome Scale

Two raw scales (ink and paper), inverted between light and dark mode. **No chromatic accents.**

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-ink` | `#050505` | `#f0ede6` | Text primary, borders, inverse surface |
| `--color-paper` | `#ffffff` | `#1a1a1a` | Surface |
| `--color-paper-soft` | `#f4f4f1` | `#111111` | Canvas background |
| `--color-paper-muted` | `#e7e7e2` | `#252525` | Strong surface, hover, disabled |
| `--color-gray-light` | `#e0e0e0` | `#3a3a3a` | Muted borders, dividers |
| `--color-gray-dark` | `#333333` | `#aaa9a3` | Muted text |

Note: `paper-soft` carries a barely-perceptible warm bias (`#f4f4f1` vs neutral `#f4f4f4`). This is intentional and deliberate: it softens stark white without breaking the monochrome rule. The bias inverts in dark mode (`#111111` is fully neutral). No other tokens carry hue.

#### Semantic surface tokens

| Token | Maps to | Use |
|---|---|---|
| `--bg-canvas` | `--color-paper-soft` | Page background |
| `--bg-surface` | `--color-paper` | Cards, panels, dialogs, inputs |
| `--bg-surface-alt` | `--color-paper-soft` | Alternating rows |
| `--bg-surface-strong` | `--color-paper-muted` | Hover, disabled, badges |
| `--bg-inverse` | `--color-ink` | Primary buttons, "active" history items, stamps |
| `--bg-overlay` | `rgb(5 5 5 / 0.72)` | Dialog scrim |
| `--bg-overlay-stripe` | `rgb(5 5 5 / 0.62)` | Dialog scrim stripe |
| `--bg-canvas-grid` | `--color-paper-muted` | Dotted background grid lines |

#### Semantic text tokens

| Token | Maps to | Use |
|---|---|---|
| `--text-primary` | `--color-ink` | Default text |
| `--text-inverse` | `--color-paper` | Text on `--bg-inverse` |
| `--text-muted` | `--color-gray-dark` | Secondary text, captions |
| `--text-on-accent` | `--color-paper` | Same as inverse; reserved for primary buttons |
| `--text-inverse-muted` | `--color-paper-muted` | Muted text on dark surfaces |

#### Semantic border tokens

| Token | Maps to | Use |
|---|---|---|
| `--border-default` | `--color-ink` | All standard borders |
| `--border-strong` | `--color-ink` | Same as default; reserved for emphasis |
| `--border-muted` | `--color-gray-light` | Dividers, low-emphasis lines |

### 3.2 Typography

Three families. No others.

| Token | Stack |
|---|---|
| `--font-display` | `'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', 'URW Palladio L', serif` |
| `--font-body` | `'Segoe UI', 'Helvetica Neue', Arial, sans-serif` |
| `--font-mono` | `'IBM Plex Mono', 'Cascadia Code', 'SFMono-Regular', Consolas, monospace` |

**Type scale** (root font-size 16px; values are `rem` unless noted):

| Token | Size | Use |
|---|---|---|
| `--font-size-xs` | `0.72rem` (~11.5px) | Eyebrows, fine print |
| `--font-size-sm` | `0.82rem` (~13px) | Captions, dense data |
| `--font-size-base` | `0.95rem` (~15px) | Body |
| `--font-size-lg` | `1.15rem` (~18px) | Lead paragraphs |
| `--font-size-xl` | `1.5rem` (~24px) | Card titles, dialog titles |
| `--font-size-2xl` | `2rem` (~32px) | Page titles |
| `--font-size-display` | `3.5rem` (~56px) | Hero / setup banner |

**Weights:** `500` (default body), `600` (emphasis), `700` (titles, button labels, mono labels). No `400`, no `800/900`. No italics.

**Line heights:** `1.0` for display titles, `1.1` for buttons and short headings, `1.4` for body, `1.45` for descriptions.

**Letter spacing:** `0` everywhere. Uppercase mono labels do not need extra tracking — the brutalist density depends on letterforms touching.

### 3.3 Spacing

Eight-step linear-ish scale. No arbitrary pixel values.

| Token | px |
|---|---|
| `--space-1` | `4` |
| `--space-2` | `8` |
| `--space-3` | `12` |
| `--space-4` | `16` |
| `--space-5` | `20` |
| `--space-6` | `24` |
| `--space-8` | `32` |
| `--space-10` | `40` |

For sub-token gaps (e.g., 6px, 10px), use a literal — these are intentional brutalist exceptions when a token would round wrong (e.g., `gap: 10px` between dense badges).

### 3.4 Borders

| Token | Value | Use |
|---|---|---|
| `--brutalist-border` | `2px solid var(--border-default)` | Default |
| `--brutalist-border-strong` | `4px solid var(--border-default)` | Dialog panels, error boxes |

Additional patterns (no token, used directly):
- `2px dashed var(--border-default)` — empty states, "no data" placeholders
- `2px solid currentColor` — badges/pills that pick up the surrounding text color
- `1px solid currentColor` — inline score badge on EvalBar (the only 1px border in the system)

**`border-radius` is `0`. Always.** Inputs, buttons, dialogs, cards, badges — every element. There are no exceptions.

### 3.5 Shadows

Hard offsets, zero blur, single solid color (`--border-default`).

| Token | Value | Use |
|---|---|---|
| `--shadow-default` | `6px 6px 0 var(--border-default)` | Buttons (rest), cards |
| `--shadow-hover` | `3px 3px 0 var(--border-default)` | Buttons (hover) |
| `--shadow-strong` | `10px 10px 0 var(--border-default)` | Dialog panels, error boxes |
| `--shadow-panel` | `4px 4px 0 var(--border-default)` | Side panels, status cards |
| `--shadow-inset` | `inset 0 0 0 2px var(--border-default)` | Selected square ring |
| `--shadow-piece-filter` | `drop-shadow(1px 1px 0 rgb(0 0 0 / 0.38))` | Chess piece silhouette lift |

**Direction is fixed**: down-and-right. Never up, never left, never centered, never blurred.

### 3.6 Focus

| Token | Value |
|---|---|
| `--focus-ring-color` | `var(--border-default)` |
| `--focus-ring-style` | `3px dashed var(--border-default)` |
| `--focus-ring` | alias for `--focus-ring-style` |

Applied via `outline` (not `box-shadow`) with `outline-offset: 2px` (squares get `4px` for buttons). All interactive elements receive `:focus-visible` styles. No element relies solely on color change to indicate focus.

### 3.7 Motion

| Token | Value |
|---|---|
| `--motion-fast` | `80ms ease-out` |

Allowed transitions:
- `transform` — buttons translate `2px, 2px` on hover, `6px, 6px` on press; history items translate `1px` on press.
- `box-shadow` — collapses from `--shadow-default` → `--shadow-hover` → none.
- `background-color` and `color` — only between defined tokens, only at `--motion-fast`.

Forbidden:
- Spring/cubic-bezier curves.
- Fade-in / fade-out (use immediate visibility).
- Slide-in / slide-out.
- Animations longer than 200ms (except EvalBar fill at `160ms ease-out` and busy-dots blink at `0.8s steps(2, start)`).

`prefers-reduced-motion: reduce` collapses every transition and animation to `1ms` (see [src/index.css](src/index.css)).

### 3.8 Z-Index Scale

| Token | Value |
|---|---|
| `--z-content` | `1` |
| `--z-sticky` | `20` |
| `--z-overlay` | `900` |
| `--z-dialog` | `1000` |
| `--z-toast` | `1100` |
| `--z-tooltip` | `1200` |

---

## 4. Stateful Expression Without Color

The central challenge of pure monochrome: **state is communicated by structure, not hue.**

| State | Visual cue | Token / pattern |
|---|---|---|
| Default | Surface + 2px solid border + `--shadow-default` | Standard |
| Hover (interactive) | Translate `2px 2px`, shadow → `--shadow-hover`, optional bg → `--bg-surface-strong` | Standard |
| Active / pressed | Translate `6px 6px`, shadow removed | Standard |
| Selected / current | Inverted fill: `--bg-inverse` + `--text-inverse`, no shadow | History active item, board square selected |
| Focus (keyboard) | `3px dashed --border-default` outline, `2px` offset | `--focus-ring-style` |
| Disabled | `--bg-surface-strong` background, `--text-muted` color, no shadow, `cursor: not-allowed` | Buttons, inputs |
| Disabled (large surfaces) | Diagonal stripe pattern, 8px stripes at 135° | EvalBar `.trackDisabled` |
| Empty | `2px dashed --border-default`, mono caption, centered | History list empty, "no games" |
| Loading / busy | Three 12px squares, `brutal-blink` 0.8s `steps(2, start)`, staggered 0.2s | `.busyDots` pattern |
| Error | Solid ink fill, paper text, mono `ALERT ·` prefix | Toast error, status banner |
| Warning | Surface + alternating diagonal stripe background + mono `NOTE ·` prefix | Toast warning, status warning panel |
| Success | `--bg-inverse` fill + `--text-inverse` + mono `OK ·` prefix | Toast success, status success panel |
| Info | Surface + radial dot pattern background + mono `INFO ·` prefix | Status neutral panel |
| Invalid input | `2px solid --border-default` + `inset 0 0 0 2px --border-default` (doubled border) + dashed border on adjacent label | `[aria-invalid="true"]` |
| Last move (board) | Dashed inner border on origin/destination squares | Board `.lastMove` |
| Legal target (board) | Centered 24% diameter dot of `--text-primary` | Board `.target` |
| Capture target (board) | Inset ring of `--text-primary`, 4px thickness | Board `.capture` |
| Movable piece (board) | Subtle inset frame of `--text-primary` | Board `.movable` |

**Status prefix labels** are required wherever color was previously the only differentiator. Render them as `<span>` elements with `font-family: var(--font-mono)`, `font-weight: 700`, `text-transform: uppercase`, followed by ` · ` (middle dot with surrounding spaces).

```
ALERT · Connection failed. Retry?
NOTE  · API key approaches its rate limit.
OK    · Game saved to archive.
INFO  · Black to move.
```

---

## 5. Components

Every shared UI primitive. Implementation files in [src/shared/ui/](src/shared/ui/).

### 5.1 Button — [Button.tsx](src/shared/ui/Button.tsx)

Three exports, all forwarding refs and accepting native `<button>` props. No `loading` prop, no `iconBefore`/`iconAfter` props — compose with children.

| Variant | Export | Purpose | Min size |
|---|---|---|---|
| Default | `Button` | Tertiary actions, in-panel buttons | 44px tall, 16px horizontal padding |
| Primary | `PrimaryButton` | Page-level commit (`START MATCH`, `SAVE`) | 52px tall, 220px wide, display serif |
| Secondary | `SecondaryButton` | Page-level dismiss (`CANCEL`, `BACK`) | 52px tall, 220px wide, display serif |

**Visual contract:**
- Border: `--brutalist-border`. Radius: `0`. Shadow: `--shadow-default`.
- Font: `--font-body` (default) or `--font-display` (primary/secondary), weight `700`, `text-transform: uppercase`.
- Hover: translate `2px 2px`, shadow → `--shadow-hover`. Default variant also shifts bg to `--bg-surface-strong`. Primary shifts bg to `--text-muted` (light dark-gray).
- Active: translate `6px 6px`, shadow removed.
- Focus: `--focus-ring-style` outline, `4px` offset.
- Disabled: `--bg-surface-strong` bg, `--text-muted` color, no shadow, no transform.

**Icon usage:** Lucide icons at `size={14}` for inline buttons, `size={16}` for icon-only toolbar buttons. `aria-hidden` on icons; the button itself carries `aria-label` if it has no visible text.

**Sizes:** The system has two sizes today (`44px` default, `52px` primary/secondary). A `sm` size (`32px`, e.g., for inline pagination) is reserved for future use; it is not implemented.

### 5.2 Link — [Link.tsx](src/shared/ui/Link.tsx)

Internal SPA navigation only. Renders `<a href={path}>`. Adds `aria-current="page"` when `match` is true.

| Prop | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | yes | Internal route. **Must not be external.** No `https://` allowed. |
| `match` | `boolean` | no | If true, applies `classes.active` and `aria-current="page"`. |
| `classes` | `{ default?: string; active?: string }` | no | Per-call overrides. The `Link` itself is unstyled; styling lives at the call site. |
| `children` | `ReactNode` | yes | Visible label. |

**Style contract:** unstyled by default — `<a>` inherits color. Underline, weight, and active state come from the call-site CSS module.

External URLs are explicitly out of scope. The app is local-first; if an external link is ever required, it must use a separate `<a target="_blank" rel="noopener noreferrer">` outside this component, with a visible `↗` glyph.

### 5.3 Form Controls — `<input>`, `<select>`, `<textarea>`

Defined globally in [src/index.css](src/index.css). No wrapper component.

| Property | Value |
|---|---|
| `min-height` | `44px` (touch target) |
| `border` | `--brutalist-border` |
| `border-radius` | `0` |
| `padding` | `10px 12px` (`select`: `10px 36px 10px 12px` for the chevron) |
| `background` | `--bg-surface` |
| `color` | `--text-primary` |
| `font` | inherited (body, weight `500`) |
| `:focus-visible` | `--focus-ring` outline, `2px` offset |
| `:disabled` | `--bg-surface-strong` bg, `--text-muted` color, `cursor: not-allowed` |
| `[aria-invalid="true"]` | doubled inset border (replaces today's red tint — see Migration Notes) |

**Labels:** every input has a `<label>` element above it (sentence case, `--font-size-sm`, `font-weight: 600`). No floating labels.

**Helper text and errors:** sit below the input as a `<p class="helper">` or `<p class="error">` with mono `INFO ·` / `ALERT ·` prefix.

### 5.4 Dialog — [Dialog.tsx](src/shared/ui/Dialog.tsx)

Modal overlay. Focus trap, `Escape` to dismiss, click-outside to close.

**Visual contract** ([Dialog.module.css](src/shared/ui/Dialog.module.css)):
- Overlay: `position: fixed; inset: 0`, z-index `--z-dialog`, padded `--space-6`. Background is a 45° repeating linear gradient between `--bg-overlay` and `--bg-overlay-stripe` (12px stripes). This diagonal pattern is the brutalist scrim.
- Panel: `min(100%, 600px)` wide, `--brutalist-border-strong` (4px), `--shadow-strong` (10px), `--bg-surface`.
- Header: `--space-5` padding, title in display serif at `1.6rem`/`700`/`line-height: 1`, close button right-aligned.
- Body: `--space-5` padding.
- Mobile (`max-width: 640px`): drops to `--space-3` padding, anchors to bottom of viewport (`place-items: end stretch`).

**Behavior:**
- `Escape` closes (top-most dialog only).
- Tab cycles within the panel (focus trap).
- Click on overlay closes; click on panel does not propagate.
- Returns focus to the originally-focused element on close.

### 5.5 Toast — [Toast.tsx](src/shared/ui/Toast/Toast.tsx)

Stack of dismissible notifications, fixed in the bottom-right (top-right on mobile). Tones: `neutral`, `success`, `warning`, `error`.

| Tone | Default duration | ARIA | Visual (target spec) |
|---|---|---|---|
| `neutral` | `4000ms` | `role="status"`, `aria-live="polite"` | `--bg-surface`, dotted radial bg pattern, `INFO ·` prefix |
| `success` | `3000ms` | `role="status"`, `aria-live="polite"` | `--bg-inverse` fill, `--text-inverse`, `OK ·` prefix |
| `warning` | `6000ms` | `role="status"`, `aria-live="polite"` | `--bg-surface` with diagonal stripe overlay, `NOTE ·` prefix |
| `error` | sticky (no auto-dismiss) | `role="alert"`, `aria-live="assertive"` | `--bg-inverse` fill, `--text-inverse`, doubled 4px border, `ALERT ·` prefix |

**Anatomy:** title (`font-weight: 700`), optional description (`--font-size-sm`), optional action button, X close button at `size={14}`. Action button sits inline-end; close button is top-right.

**Stacking:** newest on top, max ~5 visible. Older toasts beyond the limit are not auto-dismissed; they remain available below until the limit clears.

> **Note:** Today the toast tones use yellow / red / green via `--feedback-*-bg` tokens (see [src/index.css](src/index.css) lines 12–14, 75–82). The target spec above replaces these with the monochrome patterns and `OK · / NOTE · / ALERT · / INFO ·` prefixes. See [Migration Notes](#11-migration-notes).

### 5.6 ThemeToggle — [ThemeToggle.tsx](src/shared/ui/ThemeToggle.tsx)

Cycles through three preferences: `system → light → dark → system`. Renders a Lucide icon at `size={16}` (`Monitor`/`Sun`/`Moon`).

`aria-label` describes the **next** state (`"Switch to light theme"`), so screen readers announce the action, not the current state.

### 5.7 SkipLink — [SkipLink.tsx](src/shared/ui/SkipLink.tsx)

Visually hidden until `:focus`, then becomes the first visible element. Anchors to `#main-content`. Required on every page; included in the root shell.

### 5.8 Card / Panel

Not a separate component; a CSS pattern. See [GamePage.module.css](src/features/game/GamePage.module.css) `.statusCard` and `.panel`.

| Property | Value |
|---|---|
| `border` | `--brutalist-border` |
| `box-shadow` | `--shadow-panel` |
| `background` | `--bg-surface` |
| `padding` | `--space-3` (compact) or `--space-4` (default) |
| `display` | `grid; gap: --space-3` |

Cards do not nest. If you need nested grouping, use `.matchInfoSection` style: `2px solid` border, no shadow, smaller padding.

### 5.9 Badge / Status Pill

Not exported from `shared/ui` — used inline as `<span>` in feature CSS modules. See `.statusMeta span`, `.historyFact`, `.sideBadge` in [GamePage.module.css](src/features/game/GamePage.module.css).

| Property | Value |
|---|---|
| `display` | `inline-flex; align-items: center` |
| `min-height` | `28px` |
| `padding` | `5px 10px` |
| `border` | `2px solid var(--border-default)` |
| `font-family` | `--font-mono` |
| `font-size` | `0.7rem` |
| `font-weight` | `700` |
| `text-transform` | `uppercase` |
| `background` | `--bg-surface` (default), `--bg-inverse` for inverted |

Variants used today: `.sideBadgeWhite`, `.sideBadgeBlack`. The `.arbiterBadge` currently uses `--feedback-warning-bg` (yellow) and must be flattened to a black-fill inverted badge — see [Migration Notes](#11-migration-notes).

### 5.10 Tabs / Filter Buttons

Not a component yet. Today's filter pattern (in [GamesPage.tsx](src/features/games/GamesPage.tsx)) is a row of `Button` instances with one carrying `aria-pressed="true"` and inverted styling. Codify as:

- `role="group"`, `aria-label="Filter games"`.
- Each button: `aria-pressed={current === value}`.
- Pressed button: `--bg-inverse` fill, `--text-inverse`, no shadow.

---

## 6. Game-Specific Components

Implementation in [src/features/](src/features/).

### 6.1 Board — [Board.tsx](src/features/board/Board.tsx)

8×8 CSS grid. Each square is a `<button role="gridcell">` so the whole board is keyboard-navigable.

**Squares (target monochrome theme):**
- `.light`: `--color-paper` (white squares).
- `.dark`: `--color-paper-muted` (off-white squares).
- Frame: `--color-paper`, 4px border (`--brutalist-border-strong`), 4px shadow.
- Coordinate label (top-right of square): `--font-mono`, `--font-size-xs`, `--text-muted`.

**Square states (no color):**

| State | Visual |
|---|---|
| `.selected` | Inverted: `--bg-inverse` background, `--text-inverse` foreground, `--shadow-inset` ring |
| `.target` (legal move, empty) | 24%-diameter solid dot of `--text-primary` centered in square |
| `.capture` (legal move, has piece) | 4px inset ring of `--text-primary` |
| `.movable` (your piece can move) | Subtle 2px inset frame of `--text-primary` |
| `.lastMove` (origin & destination) | 2px dashed inner border |
| `.disabled` (board not interactive) | Diagonal-stripe pattern overlay at 30% opacity |

**Single theme.** The `data-board-theme` attribute remains in markup ([Board.tsx:104](src/features/board/Board.tsx)) for forward compatibility, but only one value (`paper`) is supported. The four-theme system (`paper`, `graphite`, `crimson`, `slate`) is removed — see [Migration Notes](#11-migration-notes).

**Keyboard:**
- Roving tabindex (one square owns `tabindex={0}` at a time).
- Arrow keys move focus between squares.
- `Enter` / `Space` selects.
- Click also moves the roving focus to the clicked square.

**ARIA:**
- Grid: `role="grid"`, `aria-label="Chess board"`, `aria-rowcount={8}`, `aria-colcount={8}`.
- Square: `role="gridcell"`, `aria-rowindex`, `aria-colindex`, `aria-label="{square}, {white pawn|empty|…}"`, `aria-selected` when selected.

### 6.2 EvalBar — [EvalBar.tsx](src/features/game/EvalBar.tsx)

Vertical bar (44px wide) on viewports ≥1180px; flips to horizontal (44px tall) below.

**Anatomy:**
- Track: `--bg-inverse` (the "black side" reservoir).
- White fill: `--bg-surface`, fills upward (vertical) or rightward (horizontal). Height/width is `(score + 1000) / 2000` clamped 0–1, animated `160ms ease-out`.
- Score badge: floating overlay, `--font-mono`, `0.66rem`, `font-weight: 700`, 1px border in `currentColor`. Position flips based on which side leads — when white leads, badge sits at top with white bg; when black leads, badge sits at bottom with inverse bg.
- Disabled state (`.trackDisabled`): 8px diagonal stripes alternating `--bg-surface-strong` and `--bg-surface`.

**ARIA:** `role="meter"`, `aria-valuemin={-1000}`, `aria-valuemax={1000}`, `aria-valuenow={score}`, `aria-valuetext="white +2.4"` (signed centipawns formatted to one decimal).

### 6.3 PieceIcon — [PieceIcon.tsx](src/shared/ui/PieceIcon.tsx)

Sprite-based renderer. Background-position picks one of 12 cells (6 piece types × 2 sides) from [src/assets/chess.svg](src/assets/chess.svg).

**Side distinction (no color):**
- White pieces: outlined silhouette (transparent fill, 2px stroke in `--color-ink`).
- Black pieces: solid filled silhouette in `--color-ink`.
- A `drop-shadow(1px 1px 0)` filter (`--shadow-piece-filter`) gives every piece a subtle hard cast shadow.

In dark mode, the ink color flips (so white outlines become light-cream stroke, black silhouettes become light-cream solid). Verify the SVG sprite renders correctly under both themes — it must be re-authored or post-processed if it currently uses gray-on-white. See [Migration Notes](#11-migration-notes).

### 6.4 PromotionPicker — [PromotionPicker.tsx](src/features/board/PromotionPicker.tsx)

Modal that appears when a pawn reaches the back rank. Four squares (queen, rook, bishop, knight) rendered as a horizontal row of buttons, each containing a `PieceIcon`.

**Visual contract:**
- Wrapper uses the standard `Dialog` overlay pattern.
- Each option is a 64px square button with `--brutalist-border` and `--shadow-default`.
- Hover/active follow standard button motion.
- Focus uses the standard dashed outline.

### 6.5 ArbiterToastLayer — [ArbiterToastLayer.tsx](src/features/game/ArbiterToastLayer.tsx)

Bottom-anchored ticker showing arbiter (LLM commentator/evaluator) responses.

**Layout:** stacked horizontally above the board's eval bar; takes `--board-ticker-height: 48px`.

**States:**
- Idle: empty.
- In-flight (arbiter is fetching an evaluation): `.busyDots` pattern (three blinking 12px squares).
- Result: mono text with `--font-size-sm`, two-line max, fades into existence (instantly, not animated).
- Error: `ALERT ·` prefix, sticky until next request.

### 6.6 GameStatusCard — pattern in [GamePage.module.css](src/features/game/GamePage.module.css)

Top-of-left-rail card. Tones (`.neutralTone`, `.warningTone`, `.errorTone`, `.successTone`) currently use color accents. Target monochrome treatment:

| Tone | Background |
|---|---|
| Neutral | `--bg-surface` + radial dot pattern (10px spacing, `--border-muted` dots) |
| Warning | `--bg-surface` + 45° diagonal stripes (10px, `--bg-surface` ↔ `--bg-surface-strong`), `NOTE ·` eyebrow |
| Error | `--bg-surface` + -45° diagonal stripes, status title and detail wrapped in 2px-bordered chips, `ALERT ·` eyebrow |
| Success | `--bg-inverse` fill, `--text-inverse`, `OK ·` eyebrow, eyebrow text uses `--border-muted` for low-contrast subhead |

(The current implementation uses an 8px-wide accent stripe at the left edge in `--feedback-*-bg`. Drop the accent stripe entirely; structure already encodes the tone.)

---

## 7. Patterns

### 7.1 Page Layouts

**`GamePage` (3-column grid)** — see [GamePage.module.css:11](src/features/game/GamePage.module.css)

```
┌─────────────────────────────────────────────────────────────┐
│ Header (sticky masthead from RootShell)                     │
├──────────────┬──────────────────────────┬──────────────────┤
│  Left rail   │  Board zone              │  Right rail      │
│  280–380px   │  360–600px               │  300–380px       │
│              │                          │                  │
│  Status card │  ┌────────┐ ┌─────┐     │  Move history    │
│  Actor panel │  │        │ │     │     │  (scrollable)    │
│  Match info  │  │ Board  │ │Eval │     │                  │
│              │  │        │ │ Bar │     │  History         │
│              │  │        │ │     │     │  controls        │
│              │  └────────┘ └─────┘     │                  │
│              │  Arbiter ticker          │                  │
└──────────────┴──────────────────────────┴──────────────────┘
```

Below `1180px` breakpoint, columns stack vertically: board → left rail → right rail. Below `640px`, history items collapse from two columns to one.

**`MatchSetupPage`** — two side-by-side actor cards (one for white, one for black), optional arbiter card, footer with `START MATCH` (primary) and `CANCEL` (secondary).

**`GamesPage`** — header with title + `New Match` button, filter row (`All` / `In progress` / `Finished` + sort dropdown + search), game card grid or empty state.

### 7.2 Forms

- Each field is a single column of: label → control → helper/error.
- Field gap: `--space-3`.
- Form-level actions sit below all fields, right-aligned, `Cancel` (secondary) on the left of `Submit` (primary).
- Errors appear inline below the field with `ALERT ·` prefix. The field's `aria-invalid` becomes `"true"` and `aria-describedby` points to the error paragraph.
- `<form>` itself is a CSS grid with `gap: --space-4`.

### 7.3 Empty States

Single pattern, used everywhere (history list, games archive, search no-results):

```
┌─────────────────────────────────────────┐
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │  (2px dashed border)
│                                         │
│         NO GAMES YET                    │  (mono, uppercase, 700)
│         Start a new match.              │  (sans, 600)
│                                         │
│         ┌───────────────┐               │
│         │  NEW MATCH    │               │  (primary button)
│         └───────────────┘               │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
└─────────────────────────────────────────┘
```

Background: `--bg-surface-strong`. Padding: `--space-4`. Centered text. Optional CTA below.

### 7.4 Loading States

Three patterns, by duration:

| Duration | Pattern |
|---|---|
| `< 200ms` | None. Content swap is instant. |
| `200ms – 2s` | `.busyDots` inline next to the affected element (three 12px squares blinking at 0.8s steps). |
| `> 2s` (e.g., AI request) | Full-panel busyDots + AI-turn progress bar driven by `--ai-expected-duration: 8s`. The bar is a 4px-tall `--bg-inverse` fill that grows linearly across the bottom of the actor panel. |

Skeletons are forbidden. They imply softness; brutalism does not soften.

### 7.5 Modal Flows + Confirmation Gate

The app uses a `reatomGate` pattern (see [src/shared/reatom/reatomGate.ts](src/shared/reatom/reatomGate.ts)) to suspend an action until the user confirms. Wired up for "confirm before AI API call" and credential vault unlock.

**Standard gate dialog:**

```
┌──────────────────────────────────────┐
│  CONFIRM AI REQUEST           [×]    │
├──────────────────────────────────────┤
│                                      │
│  Send a request to OpenAI            │
│  using API key ending ··3f7a?        │
│                                      │
│  ┌──────────┐  ┌──────────────────┐ │
│  │  CANCEL  │  │  CONFIRM & SEND  │ │
│  └──────────┘  └──────────────────┘ │
└──────────────────────────────────────┘
```

- Title: display serif, `1.6rem`, uppercase.
- Body: sans, sentence case, `--font-size-base`, `font-weight: 600`.
- Action row: `Cancel` (secondary, left), primary action (right). Primary action gets initial focus.

### 7.6 Background Grid

The canvas (`<html>`) carries a 24px-pitch dotted grid via two `linear-gradient` background images. This is part of the brand: every page sits on graph paper. Do not remove it for individual sections; it must show through cards and panels (which is why card backgrounds are `--bg-surface`, not transparent).

---

## 8. Accessibility

### 8.1 Contrast

- **Body text** (`--text-primary` on `--bg-surface`): `#050505` on `#ffffff` → ~20.5:1. Exceeds WCAG AAA (7:1).
- **Muted text** (`--text-muted` on `--bg-surface`): `#333333` on `#ffffff` → ~12.6:1. Exceeds AAA.
- **Inverse text** (`--text-inverse` on `--bg-inverse`): `#ffffff` on `#050505` → ~20.5:1. Exceeds AAA.
- **Inverse muted** (`--text-inverse-muted` on `--bg-inverse`): `#e7e7e2` on `#050505` → ~17:1. Exceeds AAA.
- **Focus ring** (`--focus-ring-color` on any background): `#050505` (light) / `#f0ede6` (dark). Always max contrast.

In dark mode the same ratios hold inverted. **Never use `--text-muted` on `--bg-surface-strong` for critical info** — it tightens to ~9:1, still AAA but reserved for secondary content.

### 8.2 Keyboard

- Every interactive element has `:focus-visible` styling via `--focus-ring`.
- Tab order follows DOM order. No `tabindex` values other than `0` and `-1` (board uses roving tabindex).
- Esc closes top-most dialog or popover.
- Chess board: arrow keys move focus, Enter/Space selects (see [§6.1](#61-board--boardtsx)).
- Modals trap focus. Dropdowns return focus to the trigger on close.
- Skip link (`SkipLink`) is the first focusable element.

### 8.3 Screen Reader

- `SrAnnouncer` (in [src/app/SrAnnouncer.tsx](src/app/SrAnnouncer.tsx)) is a polite `aria-live` region used to narrate moves, game-state changes, and status transitions.
- Every icon-only button has `aria-label`.
- Decorative icons carry `aria-hidden="true"`.
- Toasts use `role="status"` (polite) for neutral/success/warning and `role="alert"` (assertive) for errors.
- Eyebrows that visually precede a heading must be part of the same labelled group (use `aria-labelledby` or include them in the same `<header>` block).

### 8.4 Reduced Motion

`prefers-reduced-motion: reduce` collapses every transition and animation to `1ms`. Implemented globally in [src/index.css](src/index.css). Specifically:
- Button press/hover translations: still occur but instantaneously.
- EvalBar fill: jumps to new value instead of animating.
- BusyDots blink: a single state (no animation).
- Toast appearance: instant.

### 8.5 Color Independence

Because the system is monochrome, color-blind users experience the system identically to anyone else. Every state cue is a structural cue. This is the core a11y benefit of pure monochrome.

---

## 9. Theming

Two and only two modes, plus a `system` preference that follows `prefers-color-scheme`.

| Mode | `data-theme` | Color scheme |
|---|---|---|
| Light | `'light'` | `color-scheme: light`, ink-on-paper |
| Dark | `'dark'` | `color-scheme: dark`, paper-on-ink |
| System | (no attribute, or `'system'`) | Resolves to light or dark based on OS preference |

The theme is set on `:root` via `data-theme`; all tokens reference each other so the override at `:root[data-theme='dark']` cascades correctly.

**No custom palettes.** Users cannot change the brand color. There is no brand color.

---

## 10. Browser Support & Reduced Motion

- **Browsers:** Latest Chrome, Firefox, Safari, Edge. No IE. No legacy mobile browsers.
- **CSS features used:** CSS Grid, container queries (`container-type: size` / `inline-size`), `color-mix()`, `aspect-ratio`, custom properties, `:focus-visible`, `prefers-reduced-motion`. All are baseline 2024+.
- **Layout:** mobile-first breakpoints at `640px`, `1180px`, `1440px`. The board page is the only layout with three breakpoints; all others use one (`640px` for stack-vs-row).
- **Print:** out of scope. The dotted grid and shadows do not print well; this is a screen-only product.

---

## 11. Migration Notes

Items where the current implementation diverges from this spec. Each becomes a follow-up plan.

### 11.1 Toast palette — `src/shared/ui/Toast/Toast.module.css` (and tokens in [src/index.css](src/index.css))

**Today:** `success`, `warning`, `error` toasts use `--feedback-success-bg` (`#5fc37a`), `--feedback-warning-bg` (`#f1d85b`), `--feedback-error-bg` (`#f05a47`). These colors are also re-used by status panels and the arbiter badge.

**Target:**
- Drop `--color-warning`, `--color-error`, `--color-success` from [src/index.css](src/index.css) (lines 12–14).
- Drop `--feedback-warning-bg`, `--feedback-warning-ink`, `--feedback-error-bg`, `--feedback-error-ink`, `--feedback-success-bg`, `--feedback-success-ink` (lines 75–82). Leave `--feedback-info-bg` / `--feedback-info-ink` (already neutral).
- Replace toast tone styles with the patterns described in [§5.5](#55-toast--toasttsx): inverse fill for success/error, diagonal stripes for warning, dotted radial for neutral.
- Add the mono prefix labels (`OK ·` / `NOTE ·` / `ALERT ·` / `INFO ·`) to toast titles. The title slot in [Toast.tsx:25](src/shared/ui/Toast/Toast.tsx) becomes `<span class={prefixClass}>{prefix}</span> {title}`.

### 11.2 Board themes — `[data-board-theme]` blocks in [src/index.css](src/index.css)

**Today:** four themes (`paper`, `graphite`, `crimson`, `slate`) defined at lines 177–202. Selectable via `boardThemeAtom` ([src/features/board/boardTheme.ts](src/features/board/boardTheme.ts)). Default `paper` theme also uses red selection ring (`--color-error`), green target dots (`--color-success`), and yellow last-move (`--color-warning`).

**Target:**
- Remove the `[data-board-theme="graphite"]`, `[data-board-theme="crimson"]`, `[data-board-theme="slate"]` blocks.
- Update the default `paper` theme tokens to monochrome: `--board-selected-ring: var(--text-primary)`, `--board-target-dot: var(--text-primary)`, `--board-last-move: var(--text-primary)`. The differentiation between selected / target / last-move comes from shape (inset ring vs centered dot vs dashed border), not color.
- Remove `boardThemeAtom`, `setBoardTheme`, and the theme-picker UI. Keep `boardCoordinatesAtom` (toggling coordinate labels remains a user preference).
- Migration of existing localStorage values: any non-`paper` saved theme becomes `paper` on next load; the storage key (`ai-chess-battle.board-theme`) can be deleted.

### 11.3 Status card tones — [src/features/game/GamePage.module.css](src/features/game/GamePage.module.css)

**Today:** `.warningTone` and `.errorTone` use `--feedback-warning-bg` / `--feedback-error-bg` for an 8px-wide accent stripe at the left edge.

**Target:** drop the accent stripe entirely (the stripe pattern background already encodes the tone). Keep the diagonal-stripe and radial-dot backgrounds. Add `OK ·` / `NOTE ·` / `ALERT ·` / `INFO ·` mono eyebrows.

### 11.4 Arbiter badge — `.arbiterBadge` in [src/features/game/GamePage.module.css:474](src/features/game/GamePage.module.css)

**Today:** `background: var(--feedback-warning-bg)` (yellow).

**Target:** `background: var(--bg-inverse); color: var(--text-inverse)`. Treat the arbiter as an "inverted" sidebadge.

### 11.5 Form invalid styling — [src/index.css:256–261](src/index.css)

**Today:** `[aria-invalid="true"]` uses `--feedback-error-bg` (red) for `border-color` and inset shadow.

**Target:** doubled border using `--border-default`: `border: 2px solid var(--border-default); box-shadow: inset 0 0 0 2px var(--border-default)`. The visible double-bar pattern reads as "wrong" without color.

### 11.6 Piece sprite — [src/assets/chess.svg](src/assets/chess.svg)

**Today:** sprite contains 12 pieces (6 types × 2 sides). Verify they render as **outlined-vs-filled** silhouettes (white = outline, black = solid fill in `currentColor`), not as pre-colored gray-on-white. If the current SVG uses fixed fills, re-author so fills inherit `currentColor` and the side distinction comes from a `data-side` CSS rule on `.sprite`.

### 11.7 Hardcoded color sweep

Grep all `*.module.css` files for any of: `#`, `rgb(`, `hsl(`, `oklch(`, raw color names. Every color must reference a token. Suspected violations:
- [src/features/game/EvalBar.module.css:50](src/features/game/EvalBar.module.css) — `border: 1px solid currentColor` is allowed (uses `currentColor`, not literal).
- Any other literal hex/rgb is a divergence to fix.

### 11.8 `--shadow-piece-filter-black`

**Today:** light mode and dark mode both define this at [src/index.css:91](src/index.css) and [src/index.css:165–168](src/index.css). The dark-mode variant uses three stacked drop-shadows for an outline effect.

**Target:** keep as-is. This is a structural effect (the outline keeps the silhouette legible against same-colored squares), not a color choice.

### 11.9 Removed feature: theme picker UI

If a UI control exists today for selecting a board theme (in `MatchSetupPage` or settings), remove it as part of [§11.2](#112-board-themes--data-board-theme-blocks-in-srcindexcss).

---

**End of spec.**
