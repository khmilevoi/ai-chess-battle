import { z } from 'zod'
import type { AiProviderCallParams } from '../types'
import { getOpenAiSdk } from './client'
import {
  OpenAiHttpError,
  OpenAiResponseError,
  OpenAiTransportError,
} from './errors'
import type { OpenAiReasoningEffort } from './models'

function parseOpenAiStructuredOutput<T>({
  text,
  schema,
}: {
  text: string
  schema: AiProviderCallParams<T>['schema']
}): T {
  let parsedJson: unknown

  try {
    parsedJson = JSON.parse(text)
  } catch (cause) {
    throw new OpenAiResponseError({ cause })
  }

  const validation = schema.safeParse(parsedJson)

  if (!validation.success) {
    throw new OpenAiResponseError({ cause: validation.error })
  }

  return validation.data
}

export async function callOpenAi<T>(
  params: AiProviderCallParams<T> & {
    providerOptions?: {
      reasoningEffort?: OpenAiReasoningEffort
    }
  },
): Promise<T> {
  const { client, APIError } = await getOpenAiSdk(params.apiKey)

  const response = await client.responses
    .create(
      {
        model: params.model,
        store: false,
        reasoning:
          params.providerOptions?.reasoningEffort === undefined
            ? undefined
            : { effort: params.providerOptions.reasoningEffort },
        instructions: params.system,
        input: params.user,
        text: {
          format: {
            type: 'json_schema',
            name: 'structured_response',
            strict: true,
            schema: z.toJSONSchema(params.schema),
          },
        },
      },
      { signal: params.signal },
    )
    .catch((cause) => cause as Error)

  if (response instanceof APIError && response.status !== undefined) {
    throw new OpenAiHttpError({
      status: response.status,
      cause: response,
    })
  }

  if (response instanceof Error) {
    throw new OpenAiTransportError({
      operation: 'request',
      cause: response,
    })
  }

  if ('error' in response && response.error) {
    throw new OpenAiTransportError({
      operation: 'error-body',
      cause: response.error,
    })
  }

  if (response.output_text.length === 0) {
    throw new OpenAiResponseError({
      cause: new Error('OpenAI response did not contain output text.'),
    })
  }

  return parseOpenAiStructuredOutput({
    text: response.output_text,
    schema: params.schema,
  })
}
