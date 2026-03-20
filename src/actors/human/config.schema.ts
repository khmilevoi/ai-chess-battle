import { z } from 'zod'

export const humanActorConfigSchema = z.object({})

export type HumanActorConfig = z.infer<typeof humanActorConfigSchema>
