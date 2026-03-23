import { z } from 'zod'
import type { AiProviderModelOption } from '../providerSettings'

export type AnthropicModelOption = AiProviderModelOption

export const ANTHROPIC_MODEL_OPTIONS = [
  {
    value: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    hint: 'Balanced default for quality and latency.',
  },
  {
    value: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    hint: 'Fastest and cheapest curated option.',
  },
  {
    value: 'claude-opus-4-6',
    label: 'Claude Opus 4.6',
    hint: 'Highest quality curated option.',
  },
] as const satisfies ReadonlyArray<AnthropicModelOption>

export const DEFAULT_ANTHROPIC_MODEL = ANTHROPIC_MODEL_OPTIONS[0].value

export type AnthropicActorConfig = {
  apiKey: string
  model: string
}

export const anthropicActorConfigSchema: z.ZodType<AnthropicActorConfig> = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().min(1, 'Model is required').default(DEFAULT_ANTHROPIC_MODEL),
})
