import { GoogleGenAI } from '@google/genai'
import { named } from '@reatom/core'
import {
  GoogleGenAiHttpError,
  GoogleGenAiResponseError,
  GoogleGenAiTransportError,
  IllegalMoveError,
  type ActorRequestError,
} from '@/shared/errors'
import { type ActorMove } from '@/domain/chess/types'
import {
  AI_ACTOR_MAX_OUTPUT_TOKENS,
  AI_ACTOR_MOVE_JSON_SCHEMA,
  buildAiActorInstructions,
  buildAiActorPrompt,
  parseAiActorMoveJson,
} from '../request'
import {
  AiActor,
  type AiActorRequestArgs,
  type AiActorSharedControls,
} from '../model'
import type { GoogleActorConfig } from './config.schema'

function hasHttpStatus(
  error: unknown,
): error is Error & { status: number } {
  return (
    error instanceof Error &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  )
}

export class GoogleActorRuntime extends AiActor {
  private readonly config: GoogleActorConfig
  private readonly client: GoogleGenAI

  constructor(
    config: GoogleActorConfig,
    name: string = named('googleActorRuntime'),
    sharedControls?: AiActorSharedControls,
  ) {
    super({
      displayName: 'Gemini actor',
      name,
      sharedControls,
    })
    this.config = config
    this.client = new GoogleGenAI({
      apiKey: this.config.apiKey,
    })
  }

  protected isRetryableError(error: ActorRequestError) {
    return error instanceof GoogleGenAiResponseError || error instanceof IllegalMoveError
  }

  protected async requestModelMove({
    context,
    errorStack,
    signal,
  }: AiActorRequestArgs): Promise<ActorMove | Error> {
    const response = await this.client.models
      .generateContent({
        model: this.config.model,
        contents: buildAiActorPrompt({ context, errorStack }),
        config: {
          systemInstruction: buildAiActorInstructions(),
          responseMimeType: 'application/json',
          responseJsonSchema: AI_ACTOR_MOVE_JSON_SCHEMA,
          abortSignal: signal,
          temperature: 0,
          maxOutputTokens: AI_ACTOR_MAX_OUTPUT_TOKENS,
        },
      })
      .catch((cause) => cause as Error)

    if (hasHttpStatus(response)) {
      return new GoogleGenAiHttpError({
        status: response.status,
        cause: response,
      })
    }

    if (response instanceof Error) {
      return new GoogleGenAiTransportError({
        operation: 'request',
        cause: response,
      })
    }

    const responseText = response.text ?? ''

    if (responseText.length === 0) {
      return new GoogleGenAiResponseError({
        cause: new Error('Gemini response did not contain text output.'),
      })
    }

    return parseAiActorMoveJson({
      text: responseText,
      legalMovesBySquare: context.legalMovesBySquare,
      createResponseError: (cause) => new GoogleGenAiResponseError({ cause }),
    })
  }
}
