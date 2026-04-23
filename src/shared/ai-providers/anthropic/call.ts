import type { AiProviderCallParams } from '../types'
import { getAnthropicSdk } from './client'
import {
  AnthropicHttpError,
  AnthropicResponseError,
  AnthropicTransportError,
} from './errors'
import type { AnthropicEffort, AnthropicThinking } from './models'

const ANTHROPIC_MAX_OUTPUT_TOKENS = 128

function parseAnthropicStructuredOutput<T>({
  parsed,
  schema,
}: {
  parsed: unknown
  schema: AiProviderCallParams<T>['schema']
}): T {
  const validation = schema.safeParse(parsed)

  if (!validation.success) {
    throw new AnthropicResponseError({ cause: validation.error })
  }

  return validation.data
}

export async function callAnthropic<T>(
  params: AiProviderCallParams<T> & {
    providerOptions?: {
      effort?: AnthropicEffort
      thinking?: AnthropicThinking
    }
  },
): Promise<T> {
  const { client, APIError, zodOutputFormat } = await getAnthropicSdk(params.apiKey)

  const response = await client.messages
    .parse(
      {
        model: params.model,
        max_tokens: ANTHROPIC_MAX_OUTPUT_TOKENS,
        system: params.system,
        messages: [
          {
            role: 'user',
            content: params.user,
          },
        ],
        output_config: {
          ...(params.providerOptions?.effort === undefined
            ? {}
            : { effort: params.providerOptions.effort }),
          format: zodOutputFormat(params.schema),
        },
        ...(params.providerOptions?.thinking === 'adaptive'
          ? {
              thinking: {
                type: 'adaptive' as const,
              },
            }
          : {}),
      },
      { signal: params.signal },
    )
    .catch((cause) => cause as Error)

  if (response instanceof APIError && response.status !== undefined) {
    throw new AnthropicHttpError({
      status: response.status,
      cause: response,
    })
  }

  if (response instanceof Error) {
    throw new AnthropicTransportError({
      operation: 'request',
      cause: response,
    })
  }

  if (response.parsed_output === null || response.parsed_output === undefined) {
    throw new AnthropicResponseError({
      cause: new Error('Anthropic response did not contain parsed output.'),
    })
  }

  return parseAnthropicStructuredOutput({
    parsed: response.parsed_output,
    schema: params.schema,
  })
}
