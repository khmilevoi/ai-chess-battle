import { z } from 'zod'
import type { AiProviderModelOption } from '../providerSettings'

export type GoogleModelOption = AiProviderModelOption

export const GOOGLE_MODEL_OPTIONS = [
  {
    value: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    hint: 'Balanced default for fast move selection.',
  },
  {
    value: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    hint: 'Higher quality reasoning at a higher cost.',
  },
] as const satisfies ReadonlyArray<GoogleModelOption>

export const DEFAULT_GOOGLE_MODEL = GOOGLE_MODEL_OPTIONS[0].value

export type GoogleActorConfig = {
  apiKey: string
  model: string
}

export const googleActorConfigSchema: z.ZodType<GoogleActorConfig> = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().min(1, 'Model is required').default(DEFAULT_GOOGLE_MODEL),
})
