import type { ReasoningEffort, ResponsesModel } from 'openai/resources/shared'
import type { AiProviderModelOption } from '../types'

export type OpenAiModelOption = {
  value: ResponsesModel
  label: string
  hint?: string
}

export type OpenAiReasoningEffort = Exclude<ReasoningEffort, null>

export type OpenAiReasoningOption = {
  value: OpenAiReasoningEffort
  label: string
  hint?: string
}

export const OPENAI_REASONING_EFFORT_VALUES = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
] as const satisfies ReadonlyArray<OpenAiReasoningEffort>

export const OPENAI_MODEL_OPTIONS = [
  {
    value: 'gpt-5.4',
    label: 'GPT-5.4',
    hint: 'Best overall reasoning quality.',
  },
  {
    value: 'gpt-5.4-mini',
    label: 'GPT-5.4 Mini',
    hint: 'Faster and cheaper than full GPT-5.4.',
  },
  {
    value: 'gpt-5.4-nano',
    label: 'GPT-5.4 Nano',
    hint: 'Lowest latency in the GPT-5.4 family.',
  },
  {
    value: 'gpt-5',
    label: 'GPT-5',
    hint: 'Stable general-purpose baseline.',
  },
  {
    value: 'gpt-5-mini',
    label: 'GPT-5 Mini',
    hint: 'Cheaper GPT-5 variant for fast turns.',
  },
  {
    value: 'gpt-5-nano',
    label: 'GPT-5 Nano',
    hint: 'Smallest curated option.',
  },
] as const satisfies ReadonlyArray<OpenAiModelOption>

export const OPENAI_REASONING_OPTIONS = [
  { value: 'none', label: 'None', hint: 'No deliberate reasoning.' },
  { value: 'minimal', label: 'Minimal', hint: 'Small reasoning budget.' },
  { value: 'low', label: 'Low', hint: 'Faster responses with light reasoning.' },
  {
    value: 'medium',
    label: 'Medium',
    hint: 'Balanced speed and decision quality.',
  },
  { value: 'high', label: 'High', hint: 'Stronger reasoning for harder turns.' },
  {
    value: 'xhigh',
    label: 'X-High',
    hint: 'Maximum reasoning effort and latency.',
  },
] as const satisfies ReadonlyArray<OpenAiReasoningOption>

export const DEFAULT_OPENAI_MODEL: ResponsesModel = OPENAI_MODEL_OPTIONS[0].value
export const DEFAULT_OPENAI_REASONING_EFFORT: OpenAiReasoningEffort = 'high'
export const OPENAI_DEFAULT_ARBITER_MODEL: ResponsesModel = 'gpt-5-nano'

export const OPENAI_PROVIDER_MODEL_OPTIONS =
  OPENAI_MODEL_OPTIONS satisfies ReadonlyArray<AiProviderModelOption>
