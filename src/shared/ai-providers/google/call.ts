import { z } from 'zod'
import type { AiProviderCallParams } from '../types'
import { getGoogleSdk } from './client'
import {
  GoogleGenAiHttpError,
  GoogleGenAiResponseError,
  GoogleGenAiTransportError,
} from './errors'

const GOOGLE_THINKING_BUDGET = 128
const GOOGLE_MAX_OUTPUT_TOKENS = 512

type GoogleResponseDiagnostics = {
  finishReason?: string
  responseText: string
  candidatesTokenCount?: number
  thoughtsTokenCount?: number
}

function hasHttpStatus(error: unknown): error is Error & { status: number } {
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
}): GoogleResponseDiagnostics {
  const finishReason = response.candidates?.[0]?.finishReason

  return {
    finishReason: finishReason === undefined ? undefined : String(finishReason),
    responseText: response.text ?? '',
    candidatesTokenCount: response.usageMetadata?.candidatesTokenCount,
    thoughtsTokenCount: response.usageMetadata?.thoughtsTokenCount,
  }
}

function createGoogleResponseErrorCause({
  cause,
  responseDiagnostics,
}: {
  cause: unknown
  responseDiagnostics: GoogleResponseDiagnostics
}) {
  return Object.assign(
    new Error(
      `Model response diagnostics: finishReason=${responseDiagnostics.finishReason ?? 'unknown'}, candidatesTokenCount=${responseDiagnostics.candidatesTokenCount ?? 'unknown'}, thoughtsTokenCount=${responseDiagnostics.thoughtsTokenCount ?? 'unknown'}.`,
      { cause },
    ),
    responseDiagnostics,
  )
}

function parseGoogleStructuredOutput<T>({
  text,
  schema,
  responseDiagnostics,
}: {
  text: string
  schema: AiProviderCallParams<T>['schema']
  responseDiagnostics: GoogleResponseDiagnostics
}): T {
  let parsedJson: unknown

  try {
    parsedJson = JSON.parse(text)
  } catch (cause) {
    throw new GoogleGenAiResponseError({
      cause: createGoogleResponseErrorCause({
        cause,
        responseDiagnostics,
      }),
    })
  }

  const validation = schema.safeParse(parsedJson)

  if (!validation.success) {
    throw new GoogleGenAiResponseError({
      cause: createGoogleResponseErrorCause({
        cause: validation.error,
        responseDiagnostics,
      }),
    })
  }

  return validation.data
}

export async function callGoogle<T>(
  params: AiProviderCallParams<T>,
): Promise<T> {
  const { client } = await getGoogleSdk(params.apiKey)

  const response = await client.models
    .generateContent({
      model: params.model,
      contents: params.user,
      config: {
        systemInstruction: params.system,
        responseMimeType: 'application/json',
        responseJsonSchema: z.toJSONSchema(params.schema),
        thinkingConfig: {
          thinkingBudget: GOOGLE_THINKING_BUDGET,
        },
        abortSignal: params.signal,
        temperature: 0,
        maxOutputTokens: GOOGLE_MAX_OUTPUT_TOKENS,
      },
    })
    .catch((cause) => cause as Error)

  if (hasHttpStatus(response)) {
    throw new GoogleGenAiHttpError({
      status: response.status,
      cause: response,
    })
  }

  if (response instanceof Error) {
    throw new GoogleGenAiTransportError({
      operation: 'request',
      cause: response,
    })
  }

  const responseDiagnostics = createGoogleResponseDiagnostics(response)

  if (responseDiagnostics.responseText.length === 0) {
    throw new GoogleGenAiResponseError({
      cause: createGoogleResponseErrorCause({
        cause: new Error('Gemini response did not contain text output.'),
        responseDiagnostics,
      }),
    })
  }

  return parseGoogleStructuredOutput({
    text: responseDiagnostics.responseText,
    schema: params.schema,
    responseDiagnostics,
  })
}
