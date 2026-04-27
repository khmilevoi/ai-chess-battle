import type { ZodType } from 'zod'
import type { BoardSnapshot } from '@/domain/chess/types'
import type { AiProviderKey, AiProviderModelOption } from '@/shared/ai-providers'
import type { ArbiterPersonalityKey } from './personalities'

export type Eval = {
  score: number
  comment: string
}

export type ArbiterProviderKey = AiProviderKey

type ArbiterProviderConfig = {
  model: string
  personalityKey: ArbiterPersonalityKey
}

export type OpenAiArbiterConfig = ArbiterProviderConfig

export type AnthropicArbiterConfig = ArbiterProviderConfig

export type GoogleArbiterConfig = ArbiterProviderConfig

export type ArbiterSideConfig =
  | {
      arbiterKey: 'openai'
      arbiterConfig: OpenAiArbiterConfig
    }
  | {
      arbiterKey: 'anthropic'
      arbiterConfig: AnthropicArbiterConfig
    }
  | {
      arbiterKey: 'google'
      arbiterConfig: GoogleArbiterConfig
    }

export type ArbiterRequestArgs = {
  snapshot: BoardSnapshot
  signal: AbortSignal
}

export type ArbiterModel = {
  requestEvaluation: (args: ArbiterRequestArgs) => Promise<Eval | Error>
}

export type ArbiterDescriptor<
  Key extends ArbiterProviderKey = ArbiterProviderKey,
> = {
  key: Key
  displayName: string
  modelOptions: ReadonlyArray<AiProviderModelOption>
  configSchema: ZodType<Extract<ArbiterSideConfig, { arbiterKey: Key }>['arbiterConfig']>
  createDefaultConfig: () => Extract<ArbiterSideConfig, { arbiterKey: Key }>['arbiterConfig']
  create: (args: {
    apiKey: string
    config: Extract<ArbiterSideConfig, { arbiterKey: Key }>['arbiterConfig']
  }) => ArbiterModel
}
