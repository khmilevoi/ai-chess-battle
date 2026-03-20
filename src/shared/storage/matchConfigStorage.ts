import * as errore from 'errore'
import { StorageError } from '../errors'
import {
  createDefaultMatchConfig,
  matchSideDraftSchema,
  validateSideConfig,
} from '../../actors/registry'
import type { MatchConfig, MatchSideConfig } from '../../actors/registry'

const STORAGE_KEY = 'ai-chess-battle.match-config'
type ParsedStorageValue =
  | null
  | boolean
  | number
  | string
  | Array<unknown>
  | Record<string, unknown>

function parseStoredSide(
  side: 'white' | 'black',
  value: unknown,
): MatchSideConfig | StorageError {
  const result = matchSideDraftSchema.safeParse(value)

  if (!result.success) {
    return new StorageError({
      message: `Stored ${side} side config is invalid.`,
      cause: result.error,
    })
  }

  const validated = validateSideConfig(side, result.data)

  if (validated.error) {
    return new StorageError({
      message: `Stored ${side} side config failed actor validation.`,
      cause: validated.error,
    })
  }

  if (validated.config === null) {
    return new StorageError({
      message: `Stored ${side} side config is incomplete.`,
    })
  }

  return validated.config
}

export function loadStoredMatchConfig(): MatchConfig | StorageError | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = errore.try({
    try: () => window.localStorage.getItem(STORAGE_KEY),
    catch: (cause) =>
      new StorageError({
        message: 'Failed to read match config from localStorage.',
        cause,
      }),
  })

  if (raw instanceof Error) {
    return raw
  }

  if (raw === null) {
    return null
  }

  const parsed = errore.try({
    try: () => JSON.parse(raw) as ParsedStorageValue,
    catch: (cause) =>
      new StorageError({
        message: 'Stored match config is not valid JSON.',
        cause,
      }),
  })

  if (parsed instanceof Error) {
    return parsed
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return new StorageError({
      message: 'Stored match config is not an object.',
    })
  }

  const record = parsed as Record<string, unknown>
  const white = parseStoredSide('white', record.white)

  if (white instanceof Error) {
    return white
  }

  const black = parseStoredSide('black', record.black)

  if (black instanceof Error) {
    return black
  }

  return { white, black }
}

export function saveStoredMatchConfig(config: MatchConfig): StorageError | null {
  if (typeof window === 'undefined') {
    return null
  }

  const serialized = errore.try({
    try: () => JSON.stringify(config),
    catch: (cause) =>
      new StorageError({
        message: 'Failed to serialize match config.',
        cause,
      }),
  })

  if (serialized instanceof Error) {
    return serialized
  }

  return errore.try({
    try: () => {
      window.localStorage.setItem(STORAGE_KEY, serialized)
      return null
    },
    catch: (cause) =>
      new StorageError({
        message: 'Failed to save match config.',
        cause,
      }),
  })
}

export function fallbackMatchConfig(): MatchConfig {
  return createDefaultMatchConfig()
}
