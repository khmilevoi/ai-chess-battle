# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Agent Notes

### Reatom migration pitfalls in this repo

- `route.go()` is the canonical navigation API.
  Direct `window.history.replaceState(...)` does not update `urlAtom` after
  `urlAtom.init()`. In tests that emulate cold load, call
  `urlAtom.syncFromSource(new URL(window.location.href), true)` after changing
  `window.history`.

- Reatom route loaders are triggered by `urlAtom`, and nested loaders await
  parent loaders automatically.
  Because of that, `loader.ready()` was a bad guard for the game page here: it
  caused misleading pending state during the migration. In this repo it is more
  reliable to render from actual loader data and model state
  (`self.loader.data()` and `model.snapshot()`), not from `ready()` alone.

- `matchSessionConfig` should not be initialized by manually reading persisted
  helpers.
  It uses `withLocalStorage` directly with its own key and the shared
  `normalizeStoredMatchConfigValue` normalizer. Avoid new "load initial state"
  helpers for persisted atoms unless there is a hard reason.

- Storage migration was done as a clean break.
  Legacy raw payloads are treated as empty state. Normalization returns `null`
  instead of storage-specific errors, and invalid persisted values are reset by
  runtime flow instead of propagating `StorageError` from load helpers.

- The game model depends on an explicit first turn kick-off.
  Removing the initial `playTurn()` from `startMatch()` broke both human turn
  tests and actor retry flow. In this repo, `startMatch()` must put the model
  into `playing`, set the current `requestedTurnKey`, and start the first turn.

- `reatomMemo` usage should have one source of naming truth.
  Use anonymous arrow functions plus the explicit name argument:
  `reatomMemo((props) => { ... }, 'ComponentName')`.
  Do not mix named functions with the explicit `name` option.

- When converting to arrow functions with typed destructuring in `.tsx`, keep
  the TypeScript syntax exact.
  The valid form is `(({ foo }: Props) => { ... })`, not `(({ foo }: Props) { ... })`.

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
