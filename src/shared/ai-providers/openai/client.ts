import type OpenAIType from 'openai'
import type { APIError as APIErrorType } from 'openai'

type OpenAiSdk = {
  client: OpenAIType
  APIError: typeof APIErrorType
}

const openAiSdkCache = new Map<string, Promise<OpenAiSdk>>()

export function resetOpenAiSdkCache(): void {
  openAiSdkCache.clear()
}

export function getOpenAiSdk(apiKey: string): Promise<OpenAiSdk> {
  const cached = openAiSdkCache.get(apiKey)

  if (cached) {
    return cached
  }

  const nextSdk = import('openai')
    .then(({ default: OpenAI, APIError }) => ({
      client: new OpenAI({
        apiKey,
        baseURL: 'https://api.openai.com/v1',
        dangerouslyAllowBrowser: true,
      }),
      APIError,
    }))
    .catch((error) => {
      openAiSdkCache.delete(apiKey)
      throw error
    })

  openAiSdkCache.set(apiKey, nextSdk)
  return nextSdk
}
