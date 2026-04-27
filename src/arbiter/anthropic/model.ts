import { callAnthropic } from '@/shared/ai-providers/anthropic'
import { buildArbiterInstructions, buildArbiterPrompt } from '../request'
import { arbiterEvaluationSchema } from '../schema'
import type {
  AnthropicArbiterConfig,
  ArbiterModel,
  ArbiterRequestArgs,
} from '../types'

export function createAnthropicArbiter({
  apiKey,
  config,
}: {
  apiKey: string
  config: AnthropicArbiterConfig
}): ArbiterModel {
  return {
    async requestEvaluation({ snapshot, signal }: ArbiterRequestArgs) {
      try {
        return await callAnthropic({
          apiKey,
          model: config.model,
          system: buildArbiterInstructions(config.personalityKey),
          user: buildArbiterPrompt({ snapshot }),
          schema: arbiterEvaluationSchema,
          signal,
        })
      } catch (error) {
        return error as Error
      }
    },
  }
}
