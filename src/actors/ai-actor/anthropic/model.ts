import Anthropic, { APIError } from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { named } from '@reatom/core'
import {
  AnthropicHttpError,
  AnthropicResponseError,
  AnthropicTransportError,
  IllegalMoveError,
  type ActorRequestError,
} from '@/shared/errors'
import { type ActorMove } from '@/domain/chess/types'
import {
  AI_ACTOR_MAX_OUTPUT_TOKENS,
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
import type { AnthropicActorConfig } from './config.schema'

export class AnthropicActorRuntime extends AiActor {
  private readonly config: AnthropicActorConfig
  private readonly client: Anthropic

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
    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      dangerouslyAllowBrowser: true,
      maxRetries: 0,
    })
  }

  protected isRetryableError(error: ActorRequestError) {
    return error instanceof AnthropicResponseError || error instanceof IllegalMoveError
  }

  protected async requestModelMove({
    context,
    errorStack,
    signal,
  }: AiActorRequestArgs): Promise<ActorMove | Error> {
    const response = await this.client.messages
      .parse(
        {
          model: this.config.model,
          max_tokens: AI_ACTOR_MAX_OUTPUT_TOKENS,
          system: buildAiActorInstructions(),
          messages: [
            {
              role: 'user',
              content: buildAiActorPrompt({ context, errorStack }),
            },
          ],
          output_config: {
            format: zodOutputFormat(aiActorMoveSchema),
          },
        },
        { signal },
      )
      .catch((cause) => cause as Error)

    if (response instanceof APIError && response.status !== undefined) {
      return new AnthropicHttpError({
        status: response.status,
        cause: response,
      })
    }

    if (response instanceof Error) {
      return new AnthropicTransportError({
        operation: 'request',
        cause: response,
      })
    }

    if (response.parsed_output === null || response.parsed_output === undefined) {
      return new AnthropicResponseError({
        cause: new Error('Anthropic response did not contain parsed output.'),
      })
    }

    return validateAiActorMove({
      parsed: response.parsed_output,
      legalMovesBySquare: context.legalMovesBySquare,
      createResponseError: (cause) => new AnthropicResponseError({ cause }),
    })
  }
}
