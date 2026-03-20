import { atom, withLocalStorage } from '@reatom/core'
import type { MatchConfig } from '../actors/registry'
import { normalizeStoredMatchConfigValue } from '../shared/storage/helpers'

const STORAGE_KEY = 'ai-chess-battle.match-session-config'
const STORAGE_VERSION = 'match-session-config@1'

export const matchSessionConfig = atom<MatchConfig | null>(null, 'app.matchSessionConfig')
  .extend(
    withLocalStorage({
      key: STORAGE_KEY,
      version: STORAGE_VERSION,
      fromSnapshot: (snapshot, state) => {
        const normalized = normalizeStoredMatchConfigValue(snapshot)
        return normalized ?? state ?? null
      },
    }),
  )
