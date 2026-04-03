import { atom, peek, withActions, withLocalStorage } from '@reatom/core'
import { createDefaultMatchConfig } from '@/actors/registry'
import type { MatchConfig } from '@/actors/registry'
import {
  normalizeStoredMatchConfigSnapshotValue,
  redactMatchConfig,
  resolveStoredMatchConfig,
  type StoredMatchConfig,
} from './helpers'

const STORAGE_KEY = 'ai-chess-battle.match-config'
const STORAGE_VERSION = 'match-config@2'

function getPersistSnapshotValue(persist: unknown): unknown {
  if (typeof persist === 'object' && persist !== null && 'data' in persist) {
    return (persist as { data: unknown }).data
  }

  return persist
}

const storedMatchConfigSnapshotAtom = atom<StoredMatchConfig | null>(
  null,
  'storage.matchConfig.snapshot',
).extend(
  withLocalStorage({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    migration: (persist) =>
      normalizeStoredMatchConfigSnapshotValue(getPersistSnapshotValue(persist)),
    fromSnapshot: (snapshot, state) => {
      const normalized = normalizeStoredMatchConfigSnapshotValue(
        getPersistSnapshotValue(snapshot),
      )
      return normalized ?? state ?? null
    },
  }),
)

export const storedMatchConfig = storedMatchConfigSnapshotAtom.extend(
  withActions((target) => ({
    save(config: MatchConfig | null) {
      target.set(config === null ? null : redactMatchConfig(config))
      return null
    },
    clear() {
      target.set(null)
      return null
    },
  })),
)

export function loadStoredMatchConfig(): MatchConfig | null {
  const storedConfig = storedMatchConfig()

  return storedConfig === null ? null : resolveStoredMatchConfig(storedConfig)
}

export function readStoredMatchConfig(): MatchConfig | null {
  const storedConfig = peek(storedMatchConfig)

  return storedConfig === null ? null : resolveStoredMatchConfig(storedConfig)
}

export function fallbackMatchConfig(): MatchConfig {
  return createDefaultMatchConfig()
}
