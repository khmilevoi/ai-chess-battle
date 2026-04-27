import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ARBITER_PERSONALITY_KEY,
  getArbiterPersonality,
  isArbiterPersonalityKey,
  listArbiterPersonalities,
} from './personalities'

describe('arbiter personalities', () => {
  it('registers the default compact arbiter personality', () => {
    expect(DEFAULT_ARBITER_PERSONALITY_KEY).toBe('classic')
    expect(listArbiterPersonalities()).toEqual([
      expect.objectContaining({
        key: DEFAULT_ARBITER_PERSONALITY_KEY,
        displayName: 'Classic Arbiter',
      }),
    ])
    expect(getArbiterPersonality(DEFAULT_ARBITER_PERSONALITY_KEY).instructions).toContain(
      'witty chess arbiter',
    )
  })

  it('recognizes only registered personality keys', () => {
    expect(isArbiterPersonalityKey(DEFAULT_ARBITER_PERSONALITY_KEY)).toBe(true)
    expect(isArbiterPersonalityKey('unknown')).toBe(false)
  })
})
