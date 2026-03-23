import { describe, expect, expectTypeOf, it } from 'vitest'
import type { AiActorSharedControls } from './ai-actor'
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
  ActorModelOf,
  MatchSideConfigFromRegistry,
} from './types'

describe('actor registry', () => {
  it('uses descriptor objects from actor modules', () => {
    expect(getRegisteredActor('human')).toBe(HumanActor)
    expect(getRegisteredActor('openai')).toBe(OpenAiActor)
    expect(listRegisteredActors()).toEqual([HumanActor, OpenAiActor])
    expect(actorRegistry.human.SettingsComponent).toBe(HumanActor.SettingsComponent)
    expect(actorRegistry.human.ControlsComponent).toBeUndefined()
    expect(actorRegistry.human.controlsContract).toBeUndefined()
    expect(actorRegistry.openai.ControlsComponent).toBe(OpenAiActor.ControlsComponent)
    expect(actorRegistry.openai.controlsContract).toBeDefined()
  })

  it('returns actor-specific defaults that satisfy descriptor schemas', () => {
    const human = createDefaultSideConfig('human')
    const openai = createDefaultSideConfig('openai')

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
    expect(HumanActor.configSchema.safeParse(human.actorConfig).success).toBe(true)
    expect(openai.actorConfig.model).toBe(DEFAULT_OPENAI_MODEL)
    expect(openai.actorConfig.reasoningEffort).toBe(DEFAULT_OPENAI_REASONING_EFFORT)
  })

  it('derives helper types from descriptors and registry', () => {
    expectTypeOf<ActorConfigOf<typeof HumanActor>>().toEqualTypeOf<
      ReturnType<typeof HumanActor.createDefaultConfig>
    >()
    expectTypeOf<ActorModelOf<typeof OpenAiActor>>().toEqualTypeOf<OpenAiActorRuntime>()
    expectTypeOf<ActorDescriptorByKey<ActorRegistry, 'openai'>>().toEqualTypeOf<
      typeof OpenAiActor
    >()
    expectTypeOf<
      MatchSideConfigFromRegistry<ActorRegistry, 'human'>['actorKey']
    >().toEqualTypeOf<'human'>()
    expectTypeOf<
      MatchSideConfigFromRegistry<ActorRegistry, 'human'>['actorConfig']
    >().toEqualTypeOf<ReturnType<typeof HumanActor.createDefaultConfig>>()
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
})
