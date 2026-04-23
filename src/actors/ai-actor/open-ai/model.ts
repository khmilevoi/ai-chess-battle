import { named } from '@reatom/core'
import {
  IllegalMoveError,
  OpenAiResponseError,
  type ActorRequestError,
} from '@/shared/errors'
import { callOpenAi } from '@/shared/ai-providers/openai'
import { type ActorMove } from '@/domain/chess/types'
import {
  AiActor,
  type AiActorRequestArgs,
  type AiActorSharedControls,
} from '../model'
import {
  buildAiActorInstructions,
  buildAiActorPrompt,
  aiActorMoveSchema,
  validateAiActorMove,
} from '../request'
import type { OpenAiActorConfig } from './config.schema'

export class OpenAiActorRuntime extends AiActor {
  private readonly config: OpenAiActorConfig

  constructor(
    config: OpenAiActorConfig,
    name: string = named('openAiActorRuntime'),
    sharedControls?: AiActorSharedControls,
  ) {
    super({
      displayName: 'OpenAI actor',
      name,
      sharedControls,
    })
    this.config = config
  }

  protected isRetryableError(error: ActorRequestError) {
    return error instanceof OpenAiResponseError || error instanceof IllegalMoveError
  }

  protected async requestModelMove({
    context,
    errorStack,
    signal,
  }: AiActorRequestArgs): Promise<ActorMove | Error> {
    const parsed = await callOpenAi({
      apiKey: this.config.apiKey,
      model: this.config.model,
      system: buildAiActorInstructions(),
      user: buildAiActorPrompt({ context, errorStack }),
      schema: aiActorMoveSchema,
      signal,
      providerOptions: {
        reasoningEffort: this.config.reasoningEffort,
      },
    }).catch((cause) => cause as Error)

    if (parsed instanceof Error) {
      return parsed
    }

    return validateAiActorMove({
      parsed,
      legalMovesBySquare: context.legalMovesBySquare,
      createResponseError: (cause) => new OpenAiResponseError({ cause }),
    })
  }
}
