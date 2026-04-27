# Arbiter Personality Design

Date: 2026-04-27

## Goal

Add an arbiter personality feature that controls how the arbiter describes moves.
The initial release exposes eight preset personalities:

- Classic Arbiter
- Toxic Arbiter
- Stuffy Referee
- Doomsday Arbiter
- Deadpan Engine
- Hype Commentator
- Paranoid Arbiter
- Medieval Court Arbiter

All personalities must still produce the same arbiter JSON shape, and `comment`
must remain one short sentence under 240 characters.

## Recommended Approach

Store the selected personality as part of each arbiter provider config:

```ts
{
  model: string
  personalityKey: ArbiterPersonalityKey
}
```

This matches the existing provider-specific arbiter config pattern. Each
provider can remember its selected model and personality independently, and the
runtime prompt builder can stay provider-agnostic.

## Architecture

Introduce an arbiter personality registry, likely in
`src/arbiter/personalities.ts`.

Each personality entry should expose:

- `key`
- `displayName`
- `description`
- `instructions`

The registry should contain the approved preset personalities. The JSON response
contract should remain separate from the personality text so all personalities
still produce the same validated output shape.

Update the arbiter config types so OpenAI, Anthropic, and Google arbiter configs
include `personalityKey`. Update default config creation so every provider uses
the default personality.

## Prompt Flow

Change `buildArbiterInstructions()` to accept the selected personality key. The
helper should resolve the personality and combine:

1. The personality-specific commentary style instructions.
2. The strict JSON contract for score and comment.

Provider implementations should call the same helper with
`config.personalityKey`, keeping prompt composition centralized.

## UI

The arbiter configuration panel should add a `Personality` select below the
existing provider model setting. It should render the personality registry
options so future roster changes stay data-driven.

Changing the personality should update only `arbiterConfig.personalityKey` and
preserve the selected model.

## Storage and Migration

Existing stored arbiter configs may only contain `{ model }`. Storage
normalizers should accept those records and default the missing `personalityKey`
to the initial default personality.

The shared arbiter config store and match config storage both need this
normalization so old defaults, saved matches, and provider-specific settings keep
working after the feature lands.

Invalid personality keys should fail validation or be normalized away in storage
reads, depending on the current storage boundary:

- Active form validation should report a field error.
- Stored snapshots should migrate missing values and reject unknown values.

## Error Handling

If code attempts to build instructions for an unknown personality key, the
registry helper should fall back to the default personality or validation should
prevent that state from reaching runtime. The preferred path is validation first;
fallback is acceptable only at storage migration boundaries.

Provider API errors and response parsing stay unchanged.

## Testing

Add focused tests for:

- Arbiter instruction builder includes personality instructions and the strict
  JSON contract.
- Default arbiter configs include the default personality.
- Arbiter config validation accepts valid personality keys and rejects invalid
  ones.
- Stored `{ model }` arbiter configs migrate to `{ model, personalityKey }`.
- The match setup arbiter panel renders the Personality select and updates the
  model state when changed.

## Out of Scope

- User-authored custom prompt text.
- Provider-specific personalities.
- Changing the arbiter response schema.
