import { named } from '@reatom/core'
import type AnthropicType from '@anthropic-ai/sdk'
import type { APIError as APIErrorType } from '@anthropic-ai/sdk'
import type { zodOutputFormat as zodOutputFormatType } from '@anthropic-ai/sdk/helpers/zod'
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
import {
  getAnthropicModelOption,
  normalizeAnthropicEffort,
  type AnthropicActorConfig,
} from './config.schema'

type AnthropicSdk = {
  client: AnthropicType
  APIError: typeof APIErrorType
  zodOutputFormat: typeof zodOutputFormatType
}

export class AnthropicActorRuntime extends AiActor {
  private readonly config: AnthropicActorConfig
  private sdkCache: AnthropicSdk | null = null

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

  private async getSdk(): Promise<AnthropicSdk> {
    if (!this.sdkCache) {
      const [{ default: Anthropic, APIError }, { zodOutputFormat }] = await Promise.all([
        import('@anthropic-ai/sdk'),
        import('@anthropic-ai/sdk/helpers/zod'),
      ])
      this.sdkCache = {
        client: new Anthropic({
          apiKey: this.config.apiKey,
          dangerouslyAllowBrowser: true,
          maxRetries: 2,
        }),
        APIError,
        zodOutputFormat,
      }
    }
    return this.sdkCache
  }

  protected isRetryableError(error: ActorRequestError) {
    return error instanceof AnthropicResponseError || error instanceof IllegalMoveError
  }

  protected async requestModelMove({
    context,
    errorStack,
    signal,
  }: AiActorRequestArgs): Promise<ActorMove | Error> {
    const { client, APIError, zodOutputFormat } = await this.getSdk()
    const modelOption = getAnthropicModelOption(this.config.model)
    const effort = normalizeAnthropicEffort(this.config.model, this.config.effort)

    const response = await client.messages
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
            ...(modelOption.supportedEfforts.length > 0 ? { effort } : {}),
            format: zodOutputFormat(aiActorMoveSchema),
          },
          ...(modelOption.thinkingMode === 'adaptive'
            ? {
                thinking: {
                  type: 'adaptive' as const,
                },
              }
            : {}),
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
