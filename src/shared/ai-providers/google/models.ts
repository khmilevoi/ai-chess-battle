import type { AiProviderModelOption } from '../types'

export type GoogleModelOption = AiProviderModelOption

export const GOOGLE_MODEL_OPTIONS = [
  {
    value: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro Preview',
    hint: 'Preview Gemini 3.1 model for higher-quality reasoning.',
  },
  {
    value: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash Preview',
    hint: 'Preview Gemini 3 model tuned for faster responses.',
  },
  {
    value: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    hint: 'Balanced model for fast move selection.',
  },
  {
    value: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    hint: 'Higher quality reasoning at a higher cost.',
  },
] as const satisfies ReadonlyArray<GoogleModelOption>

export const DEFAULT_GOOGLE_MODEL = 'gemini-3.1-pro-preview'
export const GOOGLE_DEFAULT_ARBITER_MODEL = 'gemini-3-flash-preview'
