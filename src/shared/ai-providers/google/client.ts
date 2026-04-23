import type { GoogleGenAI as GoogleGenAIType } from '@google/genai'

type GoogleSdk = {
  client: GoogleGenAIType
}

const googleSdkCache = new Map<string, Promise<GoogleSdk>>()

export function resetGoogleSdkCache(): void {
  googleSdkCache.clear()
}

export function getGoogleSdk(apiKey: string): Promise<GoogleSdk> {
  const cached = googleSdkCache.get(apiKey)

  if (cached) {
    return cached
  }

  const nextSdk = import('@google/genai')
    .then(({ GoogleGenAI }) => ({
      client: new GoogleGenAI({
        apiKey,
      }),
    }))
    .catch((error) => {
      googleSdkCache.delete(apiKey)
      throw error
    })

  googleSdkCache.set(apiKey, nextSdk)
  return nextSdk
}
