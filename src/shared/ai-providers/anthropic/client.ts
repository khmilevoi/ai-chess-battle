import type AnthropicType from '@anthropic-ai/sdk'
import type { APIError as APIErrorType } from '@anthropic-ai/sdk'
import type { zodOutputFormat as zodOutputFormatType } from '@anthropic-ai/sdk/helpers/zod'

type AnthropicSdk = {
  client: AnthropicType
  APIError: typeof APIErrorType
  zodOutputFormat: typeof zodOutputFormatType
}

const anthropicSdkCache = new Map<string, Promise<AnthropicSdk>>()

export function resetAnthropicSdkCache(): void {
  anthropicSdkCache.clear()
}

export function getAnthropicSdk(apiKey: string): Promise<AnthropicSdk> {
  const cached = anthropicSdkCache.get(apiKey)

  if (cached) {
    return cached
  }

  const nextSdk = Promise.all([
    import('@anthropic-ai/sdk'),
    import('@anthropic-ai/sdk/helpers/zod'),
  ])
    .then(([{ default: Anthropic, APIError }, { zodOutputFormat }]) => ({
      client: new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true,
        maxRetries: 2,
      }),
      APIError,
      zodOutputFormat,
    }))
    .catch((error) => {
      anthropicSdkCache.delete(apiKey)
      throw error
    })

  anthropicSdkCache.set(apiKey, nextSdk)
  return nextSdk
}
