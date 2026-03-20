import { atom, peek, withLocalStorage } from '@reatom/core'
import { createDefaultMatchConfig } from '../../actors/registry'
import type { MatchConfig } from '../../actors/registry'
import { normalizeStoredMatchConfigValue } from './helpers'

const STORAGE_KEY = 'ai-chess-battle.match-config'
const STORAGE_VERSION = 'match-config@1'

export const storedMatchConfig = atom<MatchConfig | null>(null, 'storage.matchConfig').extend(
  withLocalStorage({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    fromSnapshot: (snapshot, state) => {
      const normalized = normalizeStoredMatchConfigValue(snapshot)
      return normalized ?? state ?? null
    },
  }),
)

export function loadStoredMatchConfig(): MatchConfig | null {
  return storedMatchConfig()
}

export function readStoredMatchConfig(): MatchConfig | null {
  return peek(storedMatchConfig)
}

export function fallbackMatchConfig(): MatchConfig {
  return createDefaultMatchConfig()
}
