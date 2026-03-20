import { describe, expect, expectTypeOf, it } from 'vitest'
import { HumanActor } from './human'
import { DEFAULT_OPENAI_MODEL, OpenAiActor } from './openai'
import type { OpenAiActorRuntime } from './openai/model'
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
      },
    })
    expect(HumanActor.configSchema.safeParse(human.actorConfig).success).toBe(true)
    expect(openai.actorConfig.model).toBe(DEFAULT_OPENAI_MODEL)
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
})
