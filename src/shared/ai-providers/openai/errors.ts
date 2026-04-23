import * as errore from 'errore'

class OpenAiProviderError extends Error {}

export class OpenAiTransportError extends errore.createTaggedError({
  name: 'OpenAiTransportError',
  message: 'OpenAI request failed during $operation',
  extends: OpenAiProviderError,
}) {}

export class OpenAiHttpError extends errore.createTaggedError({
  name: 'OpenAiHttpError',
  message: 'OpenAI responded with HTTP $status',
  extends: OpenAiProviderError,
}) {}

export class OpenAiResponseError extends errore.createTaggedError({
  name: 'OpenAiResponseError',
  message: 'OpenAI returned an invalid move payload',
  extends: OpenAiProviderError,
}) {}
