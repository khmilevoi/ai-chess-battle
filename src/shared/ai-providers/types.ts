import type { ZodType } from 'zod'

export type AiProviderKey = 'openai' | 'anthropic' | 'google'

export type AiProviderModelOption = {
  value: string
  label: string
  hint?: string
}

export type AiProviderCallParams<T> = {
  apiKey: string
  model: string
  system: string
  user: string
  schema: ZodType<T>
  signal?: AbortSignal
}
