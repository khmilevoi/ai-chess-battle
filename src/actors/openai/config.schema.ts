import type { ResponsesModel } from 'openai/resources'
import { z } from 'zod'

export const DEFAULT_OPENAI_MODEL: ResponsesModel = 'gpt-5.4'

export const openAiActorConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().min(1, 'Model is required').default(DEFAULT_OPENAI_MODEL),
})

export type OpenAiActorConfig = z.infer<typeof openAiActorConfigSchema>
