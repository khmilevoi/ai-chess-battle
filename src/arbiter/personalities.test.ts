import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ARBITER_PERSONALITY_KEY,
  getArbiterPersonality,
  isArbiterPersonalityKey,
  listArbiterPersonalities,
} from './personalities'

describe('arbiter personalities', () => {
  it('registers the approved personality roster with classic as default', () => {
    expect(DEFAULT_ARBITER_PERSONALITY_KEY).toBe('classic')
    expect(listArbiterPersonalities().map((personality) => personality.key)).toEqual([
      'classic',
      'toxic',
      'stuffy',
      'doomsday',
      'deadpan-engine',
      'hype-commentator',
      'paranoid',
      'medieval-court',
    ])
    expect(getArbiterPersonality(DEFAULT_ARBITER_PERSONALITY_KEY).instructions).toContain(
      'classic chess arbiter',
    )
  })

  it('recognizes only registered personality keys', () => {
    expect(isArbiterPersonalityKey(DEFAULT_ARBITER_PERSONALITY_KEY)).toBe(true)
    expect(isArbiterPersonalityKey('toxic')).toBe(true)
    expect(isArbiterPersonalityKey('unknown')).toBe(false)
  })
})
