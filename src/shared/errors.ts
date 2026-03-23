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
  | TurnCancelledError
  | Error

export function presentError(error: PresentableError): string {
  return errore.matchError(error, {
    IllegalMoveError: (issue) => `Illegal move: ${issue.uci}.`,
    ActorConfigError: (issue) =>
      `Configuration error for ${issue.side} / ${issue.actorKey}.`,
    OpenAiTransportError: () =>
      'OpenAI request failed before a response was received.',
    OpenAiHttpError: (issue) =>
      `OpenAI rejected the request with HTTP ${issue.status}.`,
    OpenAiResponseError: () =>
      'OpenAI returned data that could not be converted into a legal move.',
    AnthropicTransportError: () =>
      'Anthropic request failed before a response was received.',
    AnthropicHttpError: (issue) =>
      `Anthropic rejected the request with HTTP ${issue.status}.`,
    AnthropicResponseError: () =>
      'Anthropic returned data that could not be converted into a legal move.',
    GoogleGenAiTransportError: () =>
      'Gemini request failed before a response was received.',
    GoogleGenAiHttpError: (issue) =>
      `Gemini rejected the request with HTTP ${issue.status}.`,
    GoogleGenAiResponseError: () =>
      'Gemini returned data that could not be converted into a legal move.',
    StorageError: () =>
      'Saved configuration could not be loaded. Defaults were restored.',
    TurnCancelledError: () => 'The active turn was cancelled.',
    ActorError: (issue) => issue.message,
    EngineError: (issue) => issue.message,
    Error: (issue) => issue.message || 'Unexpected error.',
  })
}
