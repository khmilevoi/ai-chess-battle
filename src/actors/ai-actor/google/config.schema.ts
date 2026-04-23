import { z } from 'zod'
import { DEFAULT_GOOGLE_MODEL } from '@/shared/ai-providers/google'

export {
  DEFAULT_GOOGLE_MODEL,
  GOOGLE_MODEL_OPTIONS,
} from '@/shared/ai-providers/google'
export type { GoogleModelOption } from '@/shared/ai-providers/google'

export type GoogleActorConfig = {
  apiKey: string
  model: string
}

export const googleActorConfigSchema: z.ZodType<GoogleActorConfig> = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().min(1, 'Model is required').default(DEFAULT_GOOGLE_MODEL),
})
