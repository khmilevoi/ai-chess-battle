import * as errore from 'errore'

class GoogleProviderError extends Error {}

export class GoogleGenAiTransportError extends errore.createTaggedError({
  name: 'GoogleGenAiTransportError',
  message: 'Gemini request failed during $operation',
  extends: GoogleProviderError,
}) {}

export class GoogleGenAiHttpError extends errore.createTaggedError({
  name: 'GoogleGenAiHttpError',
  message: 'Gemini responded with HTTP $status',
  extends: GoogleProviderError,
}) {}

export class GoogleGenAiResponseError extends errore.createTaggedError({
  name: 'GoogleGenAiResponseError',
  message: 'Gemini returned an invalid move payload',
  extends: GoogleProviderError,
}) {}
