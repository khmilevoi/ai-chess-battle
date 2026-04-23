import * as errore from 'errore'

class AnthropicProviderError extends Error {}

export class AnthropicTransportError extends errore.createTaggedError({
  name: 'AnthropicTransportError',
  message: 'Anthropic request failed during $operation',
  extends: AnthropicProviderError,
}) {}

export class AnthropicHttpError extends errore.createTaggedError({
  name: 'AnthropicHttpError',
  message: 'Anthropic responded with HTTP $status',
  extends: AnthropicProviderError,
}) {}

export class AnthropicResponseError extends errore.createTaggedError({
  name: 'AnthropicResponseError',
  message: 'Anthropic returned an invalid move payload',
  extends: AnthropicProviderError,
}) {}
