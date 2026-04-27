import { z } from 'zod'

export const DEFAULT_ARBITER_PERSONALITY_KEY = 'classic'

export const arbiterPersonalityKeys = [DEFAULT_ARBITER_PERSONALITY_KEY] as const

export type ArbiterPersonalityKey = (typeof arbiterPersonalityKeys)[number]

export type ArbiterPersonality = {
  key: ArbiterPersonalityKey
  displayName: string
  description: string
  instructions: string
}

export const arbiterPersonalityKeySchema = z.enum(arbiterPersonalityKeys)

const arbiterPersonalityRegistry = {
  classic: {
    key: DEFAULT_ARBITER_PERSONALITY_KEY,
    displayName: 'Classic Arbiter',
    description: 'Witty, friendly chess commentary in one compact sentence.',
    instructions:
      'You are a witty chess arbiter. Describe the move in one compact sentence that is friendly, playful, and under 240 characters. Do not use markdown or long analysis.',
  },
} as const satisfies Record<ArbiterPersonalityKey, ArbiterPersonality>

export function isArbiterPersonalityKey(
  value: unknown,
): value is ArbiterPersonalityKey {
  return typeof value === 'string' && value in arbiterPersonalityRegistry
}

export function getArbiterPersonality(
  personalityKey: ArbiterPersonalityKey,
): ArbiterPersonality {
  return (
    arbiterPersonalityRegistry[personalityKey] ??
    arbiterPersonalityRegistry[DEFAULT_ARBITER_PERSONALITY_KEY]
  )
}

export function listArbiterPersonalities(): ReadonlyArray<ArbiterPersonality> {
  return Object.values(arbiterPersonalityRegistry)
}
