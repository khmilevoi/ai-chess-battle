import { named } from '@reatom/core'
import {
  AnthropicResponseError,
  IllegalMoveError,
  type ActorRequestError,
} from '@/shared/errors'
import { callAnthropic } from '@/shared/ai-providers/anthropic'
import { type ActorMove } from '@/domain/chess/types'
import {
  aiActorMoveSchema,
  buildAiActorInstructions,
  buildAiActorPrompt,
  validateAiActorMove,
} from '../request'
import {
  AiActor,
  type AiActorRequestArgs,
  type AiActorSharedControls,
} from '../model'
import {
  getAnthropicModelOption,
  normalizeAnthropicEffort,
  type AnthropicActorConfig,
} from './config.schema'

export class AnthropicActorRuntime extends AiActor {
  private readonly config: AnthropicActorConfig

  constructor(
    config: AnthropicActorConfig,
    name: string = named('anthropicActorRuntime'),
    sharedControls?: AiActorSharedControls,
  ) {
    super({
      displayName: 'Anthropic actor',
      name,
      sharedControls,
    })
    this.config = config
  }

  protected isRetryableError(error: ActorRequestError) {
    return error instanceof AnthropicResponseError || error instanceof IllegalMoveError
  }

  protected async requestModelMove({
    context,
    signal,
  }: AiActorRequestArgs): Promise<ActorMove | Error> {
    const modelOption = getAnthropicModelOption(this.config.model)
    const effort = normalizeAnthropicEffort(this.config.model, this.config.effort)
    const parsed = await callAnthropic({
      apiKey: this.config.apiKey,
      model: this.config.model,
      system: buildAiActorInstructions(),
      user: buildAiActorPrompt({ context }),
      schema: aiActorMoveSchema,
      signal,
      providerOptions: {
        effort: modelOption.supportedEfforts.length > 0 ? effort : undefined,
        thinking: modelOption.thinkingMode === 'adaptive' ? 'adaptive' : undefined,
      },
    }).catch((cause) => cause as Error)

    if (parsed instanceof Error) {
      return parsed
    }

    return validateAiActorMove({
      parsed,
      legalMovesBySquare: context.legalMovesBySquare,
      createResponseError: (cause) => new AnthropicResponseError({ cause }),
    })
  }
}
