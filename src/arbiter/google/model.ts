import { callGoogle } from '@/shared/ai-providers/google'
import { buildArbiterInstructions, buildArbiterPrompt } from '../request'
import { arbiterEvaluationSchema } from '../schema'
import type { ArbiterModel, ArbiterRequestArgs, GoogleArbiterConfig } from '../types'

export function createGoogleArbiter({
  apiKey,
  config,
}: {
  apiKey: string
  config: GoogleArbiterConfig
}): ArbiterModel {
  return {
    async requestEvaluation({ snapshot, signal }: ArbiterRequestArgs) {
      try {
        return await callGoogle({
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
