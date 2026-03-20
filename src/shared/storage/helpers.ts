import { matchSideDraftSchema, validateSideConfig } from '../../actors/registry'
import type { ActorConfigMap, MatchConfig, MatchSideConfig } from '../../actors/registry'

export type StoredActorConfigMap = Partial<ActorConfigMap>

function parseStoredSide(
  side: 'white' | 'black',
  value: unknown,
): MatchSideConfig | null {
  const result = matchSideDraftSchema.safeParse(value)

  if (!result.success) {
    return null
  }

  const validated = validateSideConfig(side, result.data)

  if (validated.error) {
    return null
  }

  if (validated.config === null) {
    return null
  }

  return validated.config
}

export function normalizeStoredMatchConfigValue(value: unknown): MatchConfig | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  const white = parseStoredSide('white', record.white)

  if (white === null) {
    return null
  }

  const black = parseStoredSide('black', record.black)

  if (black === null) {
    return null
  }

  return { white, black }
}
