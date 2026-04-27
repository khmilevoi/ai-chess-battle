import { z } from 'zod'
import {
  ANTHROPIC_DEFAULT_ARBITER_MODEL,
  ANTHROPIC_MODEL_OPTIONS,
} from '@/shared/ai-providers/anthropic'
import {
  GOOGLE_DEFAULT_ARBITER_MODEL,
  GOOGLE_MODEL_OPTIONS,
} from '@/shared/ai-providers/google'
import {
  OPENAI_DEFAULT_ARBITER_MODEL,
  OPENAI_MODEL_OPTIONS,
} from '@/shared/ai-providers/openai'
import {
  DEFAULT_ARBITER_PERSONALITY_KEY,
  arbiterPersonalityKeySchema,
} from './personalities'
import { createAnthropicArbiter } from './anthropic'
import { createGoogleArbiter } from './google'
import { createOpenAiArbiter } from './openai'
import type {
  ArbiterDescriptor,
  ArbiterProviderKey,
  ArbiterSideConfig,
} from './types'

export type { ArbiterProviderKey } from './types'

type ArbiterValidationResult = {
  config: ArbiterSideConfig | null
  error: Error | null
  fieldErrors: Record<string, Array<string>>
}

const arbiterConfigSchema = z.object({
  model: z.string().min(1, 'Model is required'),
  personalityKey: arbiterPersonalityKeySchema,
})

export const arbiterRegistry = {
  openai: {
    key: 'openai',
    displayName: 'OpenAI',
    modelOptions: OPENAI_MODEL_OPTIONS,
    configSchema: arbiterConfigSchema,
    createDefaultConfig: () => ({
      model: OPENAI_DEFAULT_ARBITER_MODEL,
      personalityKey: DEFAULT_ARBITER_PERSONALITY_KEY,
    }),
    create: ({ apiKey, config }) =>
      createOpenAiArbiter({
        apiKey,
        config,
      }),
  },
  anthropic: {
    key: 'anthropic',
    displayName: 'Anthropic',
    modelOptions: ANTHROPIC_MODEL_OPTIONS,
    configSchema: arbiterConfigSchema,
    createDefaultConfig: () => ({
      model: ANTHROPIC_DEFAULT_ARBITER_MODEL,
      personalityKey: DEFAULT_ARBITER_PERSONALITY_KEY,
    }),
    create: ({ apiKey, config }) =>
      createAnthropicArbiter({
        apiKey,
        config,
      }),
  },
  google: {
    key: 'google',
    displayName: 'Google',
    modelOptions: GOOGLE_MODEL_OPTIONS,
    configSchema: arbiterConfigSchema,
    createDefaultConfig: () => ({
      model: GOOGLE_DEFAULT_ARBITER_MODEL,
      personalityKey: DEFAULT_ARBITER_PERSONALITY_KEY,
    }),
    create: ({ apiKey, config }) =>
      createGoogleArbiter({
        apiKey,
        config,
      }),
  },
} as const satisfies Record<ArbiterProviderKey, ArbiterDescriptor>

export const arbiterKeys = Object.keys(arbiterRegistry) as Array<ArbiterProviderKey>

function normalizeFieldErrors(
  fieldErrors: Record<string, Array<string> | undefined>,
): Record<string, Array<string>> {
  return Object.fromEntries(
    Object.entries(fieldErrors).map(([key, value]) => [key, value ?? []]),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isArbiterKey(value: unknown): value is ArbiterProviderKey {
  return typeof value === 'string' && value in arbiterRegistry
}

export function getRegisteredArbiter<Key extends ArbiterProviderKey>(
  arbiterKey: Key,
) {
  return arbiterRegistry[arbiterKey]
}

export function listRegisteredArbiters() {
  return arbiterKeys.map((key) => arbiterRegistry[key])
}

export function createDefaultArbiterConfig<Key extends ArbiterProviderKey>(
  arbiterKey: Key,
): Extract<ArbiterSideConfig, { arbiterKey: Key }> {
  const descriptor = getRegisteredArbiter(arbiterKey)

  return {
    arbiterKey,
    arbiterConfig: descriptor.createDefaultConfig(),
  } as Extract<ArbiterSideConfig, { arbiterKey: Key }>
}

export function normalizeStoredArbiterConfigValue<Key extends ArbiterProviderKey>(
  arbiterKey: Key,
  value: unknown,
): Extract<ArbiterSideConfig, { arbiterKey: Key }>['arbiterConfig'] | null {
  if (!isRecord(value)) {
    return null
  }

  const candidate = {
    ...value,
    personalityKey:
      value.personalityKey === undefined
        ? DEFAULT_ARBITER_PERSONALITY_KEY
        : value.personalityKey,
  }
  const validation = getRegisteredArbiter(arbiterKey).configSchema.safeParse(candidate)

  return validation.success ? validation.data : null
}

export function validateArbiterSideConfig(
  config: ArbiterSideConfig | null,
): ArbiterValidationResult {
  if (config === null) {
    return {
      config: null,
      error: null,
      fieldErrors: {},
    }
  }

  const descriptor = getRegisteredArbiter(config.arbiterKey)
  const validation = descriptor.configSchema.safeParse(config.arbiterConfig)

  if (!validation.success) {
    return {
      config: null,
      error: new Error(`Configuration error for arbiter / ${config.arbiterKey}.`),
      fieldErrors: normalizeFieldErrors(validation.error.flatten().fieldErrors),
    }
  }

  return {
    config: {
      arbiterKey: config.arbiterKey,
      arbiterConfig: validation.data,
    } as ArbiterSideConfig,
    error: null,
    fieldErrors: {},
  }
}
