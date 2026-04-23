import { z } from 'zod'
import {
  ANTHROPIC_EFFORT_VALUES,
  DEFAULT_ANTHROPIC_EFFORT,
  DEFAULT_ANTHROPIC_MODEL,
  type AnthropicEffort,
} from '@/shared/ai-providers/anthropic'

export {
  ANTHROPIC_EFFORT_OPTIONS,
  ANTHROPIC_MODEL_OPTIONS,
  DEFAULT_ANTHROPIC_EFFORT,
  DEFAULT_ANTHROPIC_MODEL,
  getAnthropicEffortOptions,
  getAnthropicModelOption,
  normalizeAnthropicEffort,
} from '@/shared/ai-providers/anthropic'
export type {
  AnthropicEffort,
  AnthropicEffortOption,
  AnthropicModelOption,
} from '@/shared/ai-providers/anthropic'

export type AnthropicActorConfig = {
  apiKey: string
  model: string
  effort: AnthropicEffort
}

export const anthropicActorConfigSchema: z.ZodType<AnthropicActorConfig> = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().min(1, 'Model is required').default(DEFAULT_ANTHROPIC_MODEL),
  effort: z.enum(ANTHROPIC_EFFORT_VALUES).default(DEFAULT_ANTHROPIC_EFFORT),
})
