import {
  callOpenAi,
  type OpenAiReasoningEffort,
} from '@/shared/ai-providers/openai'
import { buildArbiterInstructions, buildArbiterPrompt } from '../request'
import { arbiterEvaluationSchema } from '../schema'
import type { ArbiterModel, ArbiterRequestArgs, OpenAiArbiterConfig } from '../types'

const OPENAI_ARBITER_REASONING_EFFORT: OpenAiReasoningEffort = 'low'

export function createOpenAiArbiter({
  apiKey,
  config,
}: {
  apiKey: string
  config: OpenAiArbiterConfig
}): ArbiterModel {
  return {
    async requestEvaluation({ snapshot, signal }: ArbiterRequestArgs) {
      try {
        return await callOpenAi({
          apiKey,
          model: config.model,
          system: buildArbiterInstructions(),
          user: buildArbiterPrompt({ snapshot }),
          schema: arbiterEvaluationSchema,
          signal,
          providerOptions: {
            reasoningEffort: OPENAI_ARBITER_REASONING_EFFORT,
          },
        })
      } catch (error) {
        return error as Error
      }
    },
  }
}
