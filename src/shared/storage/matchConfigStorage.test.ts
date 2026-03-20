import { beforeEach, describe, expect, it } from 'vitest'
import { StorageError } from '../errors'
import { createDefaultMatchConfig } from '../../actors/registry'
import {
  loadStoredMatchConfig,
  saveStoredMatchConfig,
} from './matchConfigStorage'

const STORAGE_KEY = 'ai-chess-battle.match-config'

describe('matchConfigStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns null when nothing is stored', () => {
    expect(loadStoredMatchConfig()).toBeNull()
  })

  it('returns a storage error for malformed json', () => {
    window.localStorage.setItem(STORAGE_KEY, '{broken')

    const result = loadStoredMatchConfig()

    expect(result).toBeInstanceOf(StorageError)
  })

  it('returns a storage error for invalid actor config', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        white: { actorKey: 'openai', actorConfig: { apiKey: '', model: '' } },
        black: { actorKey: 'human', actorConfig: {} },
      }),
    )

    const result = loadStoredMatchConfig()

    expect(result).toBeInstanceOf(StorageError)
  })

  it('round-trips valid config through localStorage', () => {
    const config = createDefaultMatchConfig()
    const saveResult = saveStoredMatchConfig(config)

    expect(saveResult).toBeNull()
    expect(loadStoredMatchConfig()).toEqual(config)
  })
})
