import { describe, expect, it } from 'vitest'
import { DEFAULT_ARBITER_PERSONALITY_KEY } from './personalities'
import {
  createDefaultArbiterConfig,
  listRegisteredArbiters,
  validateArbiterSideConfig,
} from './registry'
import type { ArbiterSideConfig } from './types'

describe('arbiter registry', () => {
  it('creates provider defaults with the default personality', () => {
    expect(createDefaultArbiterConfig('openai').arbiterConfig).toEqual(
      expect.objectContaining({
        personalityKey: DEFAULT_ARBITER_PERSONALITY_KEY,
      }),
    )
    expect(createDefaultArbiterConfig('anthropic').arbiterConfig).toEqual(
      expect.objectContaining({
        personalityKey: DEFAULT_ARBITER_PERSONALITY_KEY,
      }),
    )
    expect(createDefaultArbiterConfig('google').arbiterConfig).toEqual(
      expect.objectContaining({
        personalityKey: DEFAULT_ARBITER_PERSONALITY_KEY,
      }),
    )

    for (const descriptor of listRegisteredArbiters()) {
      expect(descriptor.configSchema.safeParse(descriptor.createDefaultConfig()).success).toBe(
        true,
      )
    }
  })

  it('validates registered personality keys and reports invalid field errors', () => {
    expect(
      validateArbiterSideConfig({
        arbiterKey: 'openai',
        arbiterConfig: {
          model: 'gpt-5-nano',
          personalityKey: DEFAULT_ARBITER_PERSONALITY_KEY,
        },
      }).error,
    ).toBeNull()

    const validation = validateArbiterSideConfig({
      arbiterKey: 'openai',
      arbiterConfig: {
        model: 'gpt-5-nano',
        personalityKey: 'unknown',
      },
    } as unknown as ArbiterSideConfig)

    expect(validation.error).toBeInstanceOf(Error)
    expect(validation.fieldErrors.personalityKey?.length).toBeGreaterThan(0)
  })
})
