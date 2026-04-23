import type { AiProviderModelOption } from '../types'

export type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type AnthropicThinkingMode = 'adaptive' | 'none'
export type AnthropicThinking = Exclude<AnthropicThinkingMode, 'none'>

export type AnthropicEffortOption = {
  value: AnthropicEffort
  label: string
  hint?: string
}

export type AnthropicModelOption = AiProviderModelOption & {
  supportedEfforts: ReadonlyArray<AnthropicEffort>
  defaultEffort: AnthropicEffort
  thinkingMode: AnthropicThinkingMode
}

export const ANTHROPIC_EFFORT_VALUES = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const satisfies ReadonlyArray<AnthropicEffort>

export const ANTHROPIC_EFFORT_OPTIONS = [
  { value: 'low', label: 'Low', hint: 'Fastest and most token-efficient.' },
  {
    value: 'medium',
    label: 'Medium',
    hint: 'Balanced default for speed, cost, and quality.',
  },
  { value: 'high', label: 'High', hint: 'High capability for harder turns.' },
  {
    value: 'xhigh',
    label: 'X-High',
    hint: 'Extended capability for long-horizon coding and agentic work.',
  },
  {
    value: 'max',
    label: 'Max',
    hint: 'Absolute maximum capability with the highest token spend.',
  },
] as const satisfies ReadonlyArray<AnthropicEffortOption>

export const ANTHROPIC_MODEL_OPTIONS = [
  {
    value: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    hint: 'Balanced default for quality and latency.',
    supportedEfforts: ['low', 'medium', 'high', 'max'],
    defaultEffort: 'medium',
    thinkingMode: 'adaptive',
  },
  {
    value: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    hint: 'Fastest and cheapest curated option.',
    supportedEfforts: [],
    defaultEffort: 'medium',
    thinkingMode: 'none',
  },
  {
    value: 'claude-opus-4-6',
    label: 'Claude Opus 4.6',
    hint: 'Highest quality curated option.',
    supportedEfforts: ['low', 'medium', 'high', 'max'],
    defaultEffort: 'high',
    thinkingMode: 'adaptive',
  },
  {
    value: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    hint: 'Latest frontier Anthropic option for deep coding work.',
    supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    thinkingMode: 'adaptive',
  },
] as const satisfies ReadonlyArray<AnthropicModelOption>

export const DEFAULT_ANTHROPIC_MODEL = ANTHROPIC_MODEL_OPTIONS[0].value
export const DEFAULT_ANTHROPIC_EFFORT = ANTHROPIC_MODEL_OPTIONS[0].defaultEffort
export const ANTHROPIC_DEFAULT_ARBITER_MODEL = 'claude-haiku-4-5'

export function getAnthropicModelOption(model: string): AnthropicModelOption {
  return (
    ANTHROPIC_MODEL_OPTIONS.find((option) => option.value === model) ??
    ANTHROPIC_MODEL_OPTIONS[0]
  )
}

export function getAnthropicEffortOptions(
  model: string,
): Array<AnthropicEffortOption> {
  const selectedModel = getAnthropicModelOption(model)

  return selectedModel.supportedEfforts.map((value) => {
    const option = ANTHROPIC_EFFORT_OPTIONS.find((entry) => entry.value === value)

    if (!option) {
      throw new Error(`Missing Anthropic effort option metadata for "${value}".`)
    }

    return option
  })
}

export function normalizeAnthropicEffort(
  model: string,
  effort: AnthropicEffort | null | undefined,
): AnthropicEffort {
  const selectedModel = getAnthropicModelOption(model)

  if (effort && selectedModel.supportedEfforts.includes(effort)) {
    return effort
  }

  return selectedModel.defaultEffort
}
