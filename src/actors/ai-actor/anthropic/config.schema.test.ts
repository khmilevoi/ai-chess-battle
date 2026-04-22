import { describe, expect, it } from 'vitest'
import {
  ANTHROPIC_EFFORT_OPTIONS,
  ANTHROPIC_MODEL_OPTIONS,
  DEFAULT_ANTHROPIC_EFFORT,
  DEFAULT_ANTHROPIC_MODEL,
  anthropicActorConfigSchema,
  getAnthropicEffortOptions,
  getAnthropicModelOption,
  normalizeAnthropicEffort,
} from './config.schema'

describe('anthropicActorConfigSchema', () => {
  it('defines per-model effort capabilities', () => {
    expect(ANTHROPIC_MODEL_OPTIONS.map((option) => option.value)).toEqual([
      'claude-sonnet-4-6',
      'claude-haiku-4-5',
      'claude-opus-4-6',
      'claude-opus-4-7',
    ])
    expect(ANTHROPIC_EFFORT_OPTIONS.map((option) => option.value)).toEqual([
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ])

    expect(getAnthropicModelOption('claude-sonnet-4-6')).toMatchObject({
      supportedEfforts: ['low', 'medium', 'high', 'max'],
      defaultEffort: 'medium',
      thinkingMode: 'adaptive',
    })
    expect(getAnthropicModelOption('claude-opus-4-6')).toMatchObject({
      supportedEfforts: ['low', 'medium', 'high', 'max'],
      defaultEffort: 'high',
      thinkingMode: 'adaptive',
    })
    expect(getAnthropicModelOption('claude-opus-4-7')).toMatchObject({
      supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      defaultEffort: 'high',
      thinkingMode: 'adaptive',
    })
    expect(getAnthropicModelOption('claude-haiku-4-5')).toMatchObject({
      supportedEfforts: [],
      defaultEffort: 'medium',
      thinkingMode: 'none',
    })
  })

  it('defaults legacy configs to medium effort and accepts Opus 4.7 xhigh', () => {
    expect(
      anthropicActorConfigSchema.parse({
        apiKey: 'anthropic-key',
        model: DEFAULT_ANTHROPIC_MODEL,
      }),
    ).toEqual({
      apiKey: 'anthropic-key',
      model: DEFAULT_ANTHROPIC_MODEL,
      effort: DEFAULT_ANTHROPIC_EFFORT,
    })

    expect(
      anthropicActorConfigSchema.parse({
        apiKey: 'anthropic-key',
        model: 'claude-opus-4-7',
        effort: 'xhigh',
      }),
    ).toEqual({
      apiKey: 'anthropic-key',
      model: 'claude-opus-4-7',
      effort: 'xhigh',
    })
  })

  it('normalizes unsupported efforts back to model defaults', () => {
    expect(getAnthropicEffortOptions('claude-haiku-4-5')).toEqual([])
    expect(normalizeAnthropicEffort('claude-sonnet-4-6', 'xhigh')).toBe('medium')
    expect(normalizeAnthropicEffort('claude-opus-4-6', 'xhigh')).toBe('high')
    expect(normalizeAnthropicEffort('claude-opus-4-7', 'xhigh')).toBe('xhigh')
    expect(normalizeAnthropicEffort('claude-haiku-4-5', 'max')).toBe('medium')
  })
})
