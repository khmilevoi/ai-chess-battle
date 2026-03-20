import { atom } from '@reatom/core'
import type { MatchConfig } from '../actors/registry'

export const matchSessionConfig = atom<MatchConfig | null>(
  null,
  'app.matchSessionConfig',
)
