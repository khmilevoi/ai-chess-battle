import OpenAI, { APIError } from 'openai'
import { named } from '@reatom/core'
import {
  IllegalMoveError,
  OpenAiHttpError,
  OpenAiResponseError,
  OpenAiTransportError,
  type ActorRequestError,
} from '@/shared/errors'
import { type ActorMove } from '@/domain/chess/types'
import {
  AiActor,
  type AiActorRequestArgs,
  type AiActorSharedControls,
} from '../model'
import {
  AI_ACTOR_MOVE_JSON_SCHEMA,
  buildAiActorInstructions,
  buildAiActorPrompt,
  parseAiActorMoveJson,
} from '../request'
import type { OpenAiActorConfig } from './config.schema'

export class OpenAiActorRuntime extends AiActor {
  private readonly config: OpenAiActorConfig
  private readonly client: OpenAI

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
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: 'https://api.openai.com/v1',
      dangerouslyAllowBrowser: true,
    })
  }

  protected isRetryableError(error: ActorRequestError) {
    return error instanceof OpenAiResponseError || error instanceof IllegalMoveError
  }

  protected async requestModelMove({
    context,
    errorStack,
    signal,
  }: AiActorRequestArgs): Promise<ActorMove | Error> {
    const response = await this.client.responses
      .create(
        {
          model: this.config.model,
          store: false,
          reasoning: { effort: this.config.reasoningEffort },
          instructions: buildAiActorInstructions(),
          input: buildAiActorPrompt({ context, errorStack }),
          text: {
            format: {
              type: 'json_schema',
              name: 'chess_move',
              strict: true,
              schema: AI_ACTOR_MOVE_JSON_SCHEMA,
            },
          },
        },
        { signal },
      )
      .catch((cause) => cause as Error)

    if (response instanceof APIError && response.status !== undefined) {
      return new OpenAiHttpError({
        status: response.status,
        cause: response,
      })
    }

    if (response instanceof Error) {
      return new OpenAiTransportError({
        operation: 'request',
        cause: response,
      })
    }

    if (response.error) {
      return new OpenAiTransportError({
        operation: 'error-body',
        cause: response.error,
      })
    }

    if (response.output_text.length === 0) {
      return new OpenAiResponseError({
        cause: new Error('OpenAI response did not contain output text.'),
      })
    }

    return parseAiActorMoveJson({
      text: response.output_text,
      legalMovesBySquare: context.legalMovesBySquare,
      createResponseError: (cause) => new OpenAiResponseError({ cause }),
    })
  }
}
