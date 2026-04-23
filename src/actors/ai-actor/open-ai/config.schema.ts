import type { ResponsesModel } from 'openai/resources/shared'
import { z } from 'zod'
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_REASONING_EFFORT,
  OPENAI_REASONING_EFFORT_VALUES,
  type OpenAiReasoningEffort,
} from '@/shared/ai-providers/openai'

export {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_REASONING_EFFORT,
  OPENAI_MODEL_OPTIONS,
  OPENAI_REASONING_OPTIONS,
} from '@/shared/ai-providers/openai'
export type {
  OpenAiModelOption,
  OpenAiReasoningEffort,
  OpenAiReasoningOption,
} from '@/shared/ai-providers/openai'

export type OpenAiActorConfig = {
  apiKey: string
  model: ResponsesModel
  reasoningEffort: OpenAiReasoningEffort
}

export const openAiActorConfigSchema: z.ZodType<OpenAiActorConfig> = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().min(1, 'Model is required').default(DEFAULT_OPENAI_MODEL),
  reasoningEffort: z
    .enum(OPENAI_REASONING_EFFORT_VALUES)
    .default(DEFAULT_OPENAI_REASONING_EFFORT),
})
