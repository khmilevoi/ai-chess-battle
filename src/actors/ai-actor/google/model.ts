import { named } from '@reatom/core'
import type { GoogleGenAI as GoogleGenAIType } from '@google/genai'
import {
  GoogleGenAiHttpError,
  GoogleGenAiResponseError,
  GoogleGenAiTransportError,
  IllegalMoveError,
  type ActorRequestError,
} from '@/shared/errors'
import { type ActorMove } from '@/domain/chess/types'
import {
  createAiActorResponseErrorCause,
  type AiActorResponseDiagnostics,
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

const GOOGLE_ACTOR_THINKING_BUDGET = 128
const GOOGLE_ACTOR_MAX_OUTPUT_TOKENS = 512

type GoogleSdk = {
  client: GoogleGenAIType
}

function hasHttpStatus(
  error: unknown,
): error is Error & { status: number } {
  return (
    error instanceof Error &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  )
}

function createGoogleResponseDiagnostics(response: {
  text?: string
  candidates?: Array<{ finishReason?: unknown }>
  usageMetadata?: {
    candidatesTokenCount?: number
    thoughtsTokenCount?: number
  }
}): AiActorResponseDiagnostics {
  const finishReason = response.candidates?.[0]?.finishReason

  return {
    finishReason: finishReason === undefined ? undefined : String(finishReason),
    responseText: response.text ?? '',
    candidatesTokenCount: response.usageMetadata?.candidatesTokenCount,
    thoughtsTokenCount: response.usageMetadata?.thoughtsTokenCount,
  }
}

export class GoogleActorRuntime extends AiActor {
  private readonly config: GoogleActorConfig
  private sdkCache: GoogleSdk | null = null

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
  }

  private async getSdk(): Promise<GoogleSdk> {
    if (!this.sdkCache) {
      const { GoogleGenAI } = await import('@google/genai')
      this.sdkCache = {
        client: new GoogleGenAI({
          apiKey: this.config.apiKey,
        }),
      }
    }
    return this.sdkCache
  }

  protected isRetryableError(error: ActorRequestError) {
    return error instanceof GoogleGenAiResponseError || error instanceof IllegalMoveError
  }

  protected async requestModelMove({
    context,
    errorStack,
    signal,
  }: AiActorRequestArgs): Promise<ActorMove | Error> {
    const { client } = await this.getSdk()

    const response = await client.models
      .generateContent({
        model: this.config.model,
        contents: buildAiActorPrompt({ context, errorStack }),
        config: {
          systemInstruction: buildAiActorInstructions(),
          responseMimeType: 'application/json',
          responseJsonSchema: AI_ACTOR_MOVE_JSON_SCHEMA,
          thinkingConfig: {
            thinkingBudget: GOOGLE_ACTOR_THINKING_BUDGET,
          },
          abortSignal: signal,
          temperature: 0,
          maxOutputTokens: GOOGLE_ACTOR_MAX_OUTPUT_TOKENS,
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

    const responseDiagnostics = createGoogleResponseDiagnostics(response)
    const responseText = responseDiagnostics.responseText

    if (responseText.length === 0) {
      return new GoogleGenAiResponseError({
        cause: createAiActorResponseErrorCause({
          cause: new Error('Gemini response did not contain text output.'),
          responseDiagnostics,
        }),
      })
    }

    return parseAiActorMoveJson({
      text: responseText,
      legalMovesBySquare: context.legalMovesBySquare,
      createResponseError: (cause) => new GoogleGenAiResponseError({ cause }),
      responseDiagnostics,
    })
  }
}
