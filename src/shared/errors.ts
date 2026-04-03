import * as errore from 'errore'

class EngineDomainError extends Error {}
class ActorDomainError extends Error {}

export class EngineError extends errore.createTaggedError({
  name: 'EngineError',
  extends: EngineDomainError,
}) {}

export class IllegalMoveError extends errore.createTaggedError({
  name: 'IllegalMoveError',
  message: 'Illegal move $uci',
  extends: EngineDomainError,
}) {}

export class ActorError extends errore.createTaggedError({
  name: 'ActorError',
  extends: ActorDomainError,
}) {}

export class ActorConfigError extends errore.createTaggedError({
  name: 'ActorConfigError',
  message: 'Invalid $side actor config for $actorKey',
  extends: ActorDomainError,
}) {}

export class OpenAiTransportError extends errore.createTaggedError({
  name: 'OpenAiTransportError',
  message: 'OpenAI request failed during $operation',
  extends: ActorDomainError,
}) {}

export class OpenAiHttpError extends errore.createTaggedError({
  name: 'OpenAiHttpError',
  message: 'OpenAI responded with HTTP $status',
  extends: ActorDomainError,
}) {}

export class OpenAiResponseError extends errore.createTaggedError({
  name: 'OpenAiResponseError',
  message: 'OpenAI returned an invalid move payload',
  extends: ActorDomainError,
}) {}

export class AnthropicTransportError extends errore.createTaggedError({
  name: 'AnthropicTransportError',
  message: 'Anthropic request failed during $operation',
  extends: ActorDomainError,
}) {}

export class AnthropicHttpError extends errore.createTaggedError({
  name: 'AnthropicHttpError',
  message: 'Anthropic responded with HTTP $status',
  extends: ActorDomainError,
}) {}

export class AnthropicResponseError extends errore.createTaggedError({
  name: 'AnthropicResponseError',
  message: 'Anthropic returned an invalid move payload',
  extends: ActorDomainError,
}) {}

export class GoogleGenAiTransportError extends errore.createTaggedError({
  name: 'GoogleGenAiTransportError',
  message: 'Gemini request failed during $operation',
  extends: ActorDomainError,
}) {}

export class GoogleGenAiHttpError extends errore.createTaggedError({
  name: 'GoogleGenAiHttpError',
  message: 'Gemini responded with HTTP $status',
  extends: ActorDomainError,
}) {}

export class GoogleGenAiResponseError extends errore.createTaggedError({
  name: 'GoogleGenAiResponseError',
  message: 'Gemini returned an invalid move payload',
  extends: ActorDomainError,
}) {}

export class StorageError extends errore.createTaggedError({
  name: 'StorageError',
}) {}

export class CredentialError extends errore.createTaggedError({
  name: 'CredentialError',
  extends: ActorDomainError,
}) {}

export class VaultLockedError extends errore.createTaggedError({
  name: 'VaultLockedError',
  message: 'Unlock the credential vault before editing API keys.',
}) {}

export class TurnCancelledError extends errore.createTaggedError({
  name: 'TurnCancelledError',
  message: 'Turn cancelled for $side',
  extends: errore.AbortError,
}) {}

export type EngineFailure = EngineError | IllegalMoveError

export type ActorRequestError =
  | ActorError
  | OpenAiTransportError
  | OpenAiHttpError
  | OpenAiResponseError
  | AnthropicTransportError
  | AnthropicHttpError
  | AnthropicResponseError
  | GoogleGenAiTransportError
  | GoogleGenAiHttpError
  | GoogleGenAiResponseError
  | IllegalMoveError
  | TurnCancelledError

export type PresentableError =
  | EngineError
  | IllegalMoveError
  | ActorError
  | ActorConfigError
  | OpenAiTransportError
  | OpenAiHttpError
  | OpenAiResponseError
  | AnthropicTransportError
  | AnthropicHttpError
  | AnthropicResponseError
  | GoogleGenAiTransportError
  | GoogleGenAiHttpError
  | GoogleGenAiResponseError
  | StorageError
  | CredentialError
  | VaultLockedError
  | TurnCancelledError
  | Error

export function presentError(error: PresentableError): string {
  if (error instanceof IllegalMoveError) {
    return `Illegal move: ${error.uci}.`
  }

  if (error instanceof ActorConfigError) {
    return `Configuration error for ${error.side} / ${error.actorKey}.`
  }

  if (error instanceof OpenAiTransportError) {
    return 'OpenAI request failed before a response was received.'
  }

  if (error instanceof OpenAiHttpError) {
    return `OpenAI rejected the request with HTTP ${error.status}.`
  }

  if (error instanceof OpenAiResponseError) {
    return 'OpenAI returned data that could not be converted into a legal move.'
  }

  if (error instanceof AnthropicTransportError) {
    return 'Anthropic request failed before a response was received.'
  }

  if (error instanceof AnthropicHttpError) {
    return `Anthropic rejected the request with HTTP ${error.status}.`
  }

  if (error instanceof AnthropicResponseError) {
    return 'Anthropic returned data that could not be converted into a legal move.'
  }

  if (error instanceof GoogleGenAiTransportError) {
    return 'Gemini request failed before a response was received.'
  }

  if (error instanceof GoogleGenAiHttpError) {
    return `Gemini rejected the request with HTTP ${error.status}.`
  }

  if (error instanceof GoogleGenAiResponseError) {
    return 'Gemini returned data that could not be converted into a legal move.'
  }

  if (error instanceof StorageError) {
    return 'Saved configuration could not be loaded. Defaults were restored.'
  }

  if (error instanceof CredentialError) {
    return error.message
  }

  if (error instanceof VaultLockedError) {
    return 'Unlock the credential vault before editing API keys.'
  }

  if (error instanceof TurnCancelledError) {
    return 'The active turn was cancelled.'
  }

  if (error instanceof ActorError || error instanceof EngineError) {
    return error.message
  }

  return error.message || 'Unexpected error.'
}
