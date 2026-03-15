import { type ComponentType } from 'react'
import { z, type ZodType } from 'zod'
import type { ActorConfigError } from '../../shared/errors'
import type { GameActor, Side } from '../chess/types'

export const actorKeys = ['human', 'openai'] as const

export type ActorKey = (typeof actorKeys)[number]

export type MatchSideConfig = {
  actorKey: ActorKey
  actorConfig: unknown
}

export type MatchConfig = {
  white: MatchSideConfig
  black: MatchSideConfig
}

export type ActorSettingsComponentProps<TConfig> = {
  side: Side
  value: TConfig
  onChange: (next: TConfig) => void
  errors: Record<string, Array<string>>
}

export interface RegisteredActor<TConfig> {
  key: ActorKey
  displayName: string
  summary: string
  configSchema: ZodType<TConfig>
  createDefaultConfig: () => TConfig
  SettingsComponent: ComponentType<ActorSettingsComponentProps<TConfig>>
  create: (config: TConfig) => GameActor | ActorConfigError
}

export type AnyRegisteredActor = RegisteredActor<any>

export type SideValidation = {
  config: MatchSideConfig | null
  error: ActorConfigError | null
  fieldErrors: Record<string, Array<string>>
}

export const emptyObjectSchema = z.object({})
