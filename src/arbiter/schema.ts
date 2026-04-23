import { z } from 'zod'

export const arbiterEvaluationSchema = z.object({
  score: z.number().int().min(-1000).max(1000),
  comment: z.string().min(1).max(240),
})
