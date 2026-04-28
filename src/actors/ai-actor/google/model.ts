import { named } from '@reatom/core'
import {
  GoogleGenAiResponseError,
  IllegalMoveError,
  type ActorRequestError,
} from '@/shared/errors'
import { callGoogle } from '@/shared/ai-providers/google'
import { type ActorMove } from '@/domain/chess/types'
import { buildAiActorInstructions, buildAiActorPrompt, aiActorMoveSchema, validateAiActorMove } from '../request'
import {
  AiActor,
  type AiActorRequestArgs,
  type AiActorSharedControls,
} from '../model'
import type { GoogleActorConfig } from './config.schema'

export class GoogleActorRuntime extends AiActor {
  private readonly config: GoogleActorConfig

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

  protected isRetryableError(error: ActorRequestError) {
    return error instanceof GoogleGenAiResponseError || error instanceof IllegalMoveError
  }

  protected async requestModelMove({
    context,
    signal,
  }: AiActorRequestArgs): Promise<ActorMove | Error> {
    const parsed = await callGoogle({
      apiKey: this.config.apiKey,
      model: this.config.model,
      system: buildAiActorInstructions(),
      user: buildAiActorPrompt({ context }),
      schema: aiActorMoveSchema,
      signal,
    }).catch((cause) => cause as Error)

    if (parsed instanceof Error) {
      return parsed
    }

    return validateAiActorMove({
      parsed,
      legalMovesBySquare: context.legalMovesBySquare,
      createResponseError: (cause) => new GoogleGenAiResponseError({ cause }),
    })
  }
}
