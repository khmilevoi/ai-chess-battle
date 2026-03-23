import { describe, expect, expectTypeOf, it } from 'vitest'
import type { AiActorSharedControls } from './ai-actor'
import {
  AnthropicActor,
  AnthropicActorRuntime,
  DEFAULT_ANTHROPIC_MODEL,
} from './ai-actor/anthropic'
import {
  DEFAULT_GOOGLE_MODEL,
  GoogleActor,
  GoogleActorRuntime,
} from './ai-actor/google'
import { HumanActor } from './human'
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_REASONING_EFFORT,
  OpenAiActor,
  OpenAiActorRuntime,
} from './ai-actor/open-ai'
import {
  actorRegistry,
  createDefaultSideConfig,
  getRegisteredActor,
  listRegisteredActors,
  type ActorRegistry,
} from './registry'
import type {
  ActorConfigOf,
  ActorDescriptorByKey,
  ActorMatchInfoPropsOf,
  ActorModelOf,
  MatchSideConfigFromRegistry,
} from './types'

describe('actor registry', () => {
  it('uses descriptor objects from actor modules', () => {
    expect(getRegisteredActor('human')).toBe(HumanActor)
    expect(getRegisteredActor('openai')).toBe(OpenAiActor)
    expect(getRegisteredActor('anthropic')).toBe(AnthropicActor)
    expect(getRegisteredActor('google')).toBe(GoogleActor)
    expect(listRegisteredActors()).toEqual([
      HumanActor,
      OpenAiActor,
      AnthropicActor,
      GoogleActor,
    ])
    expect(actorRegistry.human.SettingsComponent).toBe(HumanActor.SettingsComponent)
    expect(actorRegistry.human.MatchInfoComponent).toBe(HumanActor.MatchInfoComponent)
    expect(actorRegistry.human.ControlsComponent).toBeUndefined()
    expect(actorRegistry.human.controlsContract).toBeUndefined()
    expect(actorRegistry.openai.MatchInfoComponent).toBe(OpenAiActor.MatchInfoComponent)
    expect(actorRegistry.openai.ControlsComponent).toBe(OpenAiActor.ControlsComponent)
    expect(actorRegistry.openai.controlsContract).toBeDefined()
    expect(actorRegistry.anthropic.MatchInfoComponent).toBe(
      AnthropicActor.MatchInfoComponent,
    )
    expect(actorRegistry.anthropic.ControlsComponent).toBe(
      AnthropicActor.ControlsComponent,
    )
    expect(actorRegistry.anthropic.controlsContract).toBeDefined()
    expect(actorRegistry.google.MatchInfoComponent).toBe(GoogleActor.MatchInfoComponent)
    expect(actorRegistry.google.ControlsComponent).toBe(
      GoogleActor.ControlsComponent,
    )
    expect(actorRegistry.google.controlsContract).toBeDefined()
  })

  it('returns actor-specific defaults that satisfy descriptor schemas', () => {
    const human = createDefaultSideConfig('human')
    const openai = createDefaultSideConfig('openai')
    const anthropic = createDefaultSideConfig('anthropic')
    const google = createDefaultSideConfig('google')

    expect(human).toEqual({
      actorKey: 'human',
      actorConfig: {},
    })
    expect(openai).toEqual({
      actorKey: 'openai',
      actorConfig: {
        apiKey: '',
        model: DEFAULT_OPENAI_MODEL,
        reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
      },
    })
    expect(anthropic).toEqual({
      actorKey: 'anthropic',
      actorConfig: {
        apiKey: '',
        model: DEFAULT_ANTHROPIC_MODEL,
      },
    })
    expect(google).toEqual({
      actorKey: 'google',
      actorConfig: {
        apiKey: '',
        model: DEFAULT_GOOGLE_MODEL,
      },
    })
    expect(HumanActor.configSchema.safeParse(human.actorConfig).success).toBe(true)
    expect(openai.actorConfig.model).toBe(DEFAULT_OPENAI_MODEL)
    expect(openai.actorConfig.reasoningEffort).toBe(DEFAULT_OPENAI_REASONING_EFFORT)
    expect(anthropic.actorConfig.model).toBe(DEFAULT_ANTHROPIC_MODEL)
    expect(google.actorConfig.model).toBe(DEFAULT_GOOGLE_MODEL)
  })

  it('derives helper types from descriptors and registry', () => {
    expectTypeOf<ActorConfigOf<typeof HumanActor>>().toEqualTypeOf<
      ReturnType<typeof HumanActor.createDefaultConfig>
    >()
    expectTypeOf<ActorModelOf<typeof OpenAiActor>>().toEqualTypeOf<OpenAiActorRuntime>()
    expectTypeOf<ActorModelOf<typeof AnthropicActor>>().toEqualTypeOf<
      AnthropicActorRuntime
    >()
    expectTypeOf<ActorModelOf<typeof GoogleActor>>().toEqualTypeOf<
      GoogleActorRuntime
    >()
    expectTypeOf<ActorDescriptorByKey<ActorRegistry, 'openai'>>().toEqualTypeOf<
      typeof OpenAiActor
    >()
    expectTypeOf<
      ActorDescriptorByKey<ActorRegistry, 'anthropic'>
    >().toEqualTypeOf<typeof AnthropicActor>()
    expectTypeOf<
      ActorDescriptorByKey<ActorRegistry, 'google'>
    >().toEqualTypeOf<typeof GoogleActor>()
    expectTypeOf<
      MatchSideConfigFromRegistry<ActorRegistry, 'human'>['actorKey']
    >().toEqualTypeOf<'human'>()
    expectTypeOf<
      MatchSideConfigFromRegistry<ActorRegistry, 'human'>['actorConfig']
    >().toEqualTypeOf<ReturnType<typeof HumanActor.createDefaultConfig>>()
    expectTypeOf<ActorMatchInfoPropsOf<typeof OpenAiActor>>().toEqualTypeOf<{
      side: 'white' | 'black'
      value: ReturnType<typeof OpenAiActor.createDefaultConfig>
    }>()
  })

  it('creates OpenAI runtimes through descriptor contracts', () => {
    const config = {
      apiKey: 'sk-test',
      model: DEFAULT_OPENAI_MODEL,
      reasoningEffort: DEFAULT_OPENAI_REASONING_EFFORT,
    }
    const runtimeControls = {
      waitForConfirmation: () => false,
      setWaitForConfirmationValue: () => null,
    } as unknown as AiActorSharedControls
    const actor = OpenAiActor.create(config, { runtimeControls })

    if (!(actor instanceof OpenAiActorRuntime)) {
      throw actor
    }

    expect(OpenAiActor.controlsContract?.getControlGroupKey(config)).toBe('openai')
    expect(actor.waitForConfirmation).toBe(runtimeControls.waitForConfirmation)
  })

  it('creates Anthropic and Gemini runtimes through descriptor contracts', () => {
    const anthropicConfig = {
      apiKey: 'sk-ant',
      model: DEFAULT_ANTHROPIC_MODEL,
    }
    const googleConfig = {
      apiKey: 'google-key',
      model: DEFAULT_GOOGLE_MODEL,
    }
    const runtimeControls = {
      waitForConfirmation: () => false,
      setWaitForConfirmationValue: () => null,
    } as unknown as AiActorSharedControls
    const anthropic = AnthropicActor.create(anthropicConfig, { runtimeControls })
    const google = GoogleActor.create(googleConfig, { runtimeControls })

    if (!(anthropic instanceof AnthropicActorRuntime)) {
      throw anthropic
    }

    if (!(google instanceof GoogleActorRuntime)) {
      throw google
    }

    expect(AnthropicActor.controlsContract?.getControlGroupKey(anthropicConfig)).toBe(
      'anthropic',
    )
    expect(GoogleActor.controlsContract?.getControlGroupKey(googleConfig)).toBe(
      'google',
    )
    expect(anthropic.waitForConfirmation).toBe(runtimeControls.waitForConfirmation)
    expect(google.waitForConfirmation).toBe(runtimeControls.waitForConfirmation)
  })
})
