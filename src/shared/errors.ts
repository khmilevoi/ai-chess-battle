import * as errore from 'errore'
import {
  AnthropicHttpError,
  AnthropicResponseError,
  AnthropicTransportError,
} from '@/shared/ai-providers/anthropic'
import {
  GoogleGenAiHttpError,
  GoogleGenAiResponseError,
  GoogleGenAiTransportError,
} from '@/shared/ai-providers/google'
import {
  OpenAiHttpError,
  OpenAiResponseError,
  OpenAiTransportError,
} from '@/shared/ai-providers/openai'

export {
  OpenAiHttpError,
  OpenAiResponseError,
  OpenAiTransportError,
} from '@/shared/ai-providers/openai'
export {
  AnthropicHttpError,
  AnthropicResponseError,
  AnthropicTransportError,
} from '@/shared/ai-providers/anthropic'
export {
  GoogleGenAiHttpError,
  GoogleGenAiResponseError,
  GoogleGenAiTransportError,
} from '@/shared/ai-providers/google'

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
