import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const openAiMock = vi.hoisted(() => {
  class MockApiError extends Error {
    status?: number

    constructor(message: string, status?: number) {
      super(message)
      this.name = 'APIError'
      this.status = status
    }
  }

  const create = vi.fn()
  const OpenAI = vi.fn(function MockOpenAI() {
    return {
      responses: {
        create,
      },
    }
  })

  return {
    APIError: MockApiError,
    OpenAI,
    create,
  }
})

vi.mock('openai', () => ({
  default: openAiMock.OpenAI,
  APIError: openAiMock.APIError,
}))

import { OpenAiHttpError } from './errors'
import { callOpenAi } from './call'

const responseSchema = z.object({
  score: z.number().int(),
  comment: z.string(),
})

describe('callOpenAi', () => {
  beforeEach(() => {
    openAiMock.OpenAI.mockClear()
    openAiMock.create.mockReset()
  })

  it('returns schema-validated parsed output', async () => {
    openAiMock.create.mockResolvedValue({
      output_text: JSON.stringify({
        score: 24,
        comment: 'White still owns the center.',
      }),
    })

    const result = await callOpenAi({
      apiKey: 'sk-test',
      model: 'gpt-5.4-mini',
      system: 'system prompt',
      user: '{"fen":"test"}',
      schema: responseSchema,
      providerOptions: {
        reasoningEffort: 'low',
      },
    })

    expect(result).toEqual({
      score: 24,
      comment: 'White still owns the center.',
    })
    expect(openAiMock.OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-test',
        baseURL: 'https://api.openai.com/v1',
        dangerouslyAllowBrowser: true,
      }),
    )
    expect(openAiMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5.4-mini',
        store: false,
        instructions: 'system prompt',
        input: '{"fen":"test"}',
        reasoning: { effort: 'low' },
        text: expect.objectContaining({
          format: expect.objectContaining({
            type: 'json_schema',
            strict: true,
            schema: expect.any(Object),
          }),
        }),
      }),
      { signal: undefined },
    )
  })

  it('maps sdk http failures to OpenAiHttpError', async () => {
    openAiMock.create.mockRejectedValue(
      new openAiMock.APIError('Unauthorized', 401),
    )

    await expect(
      callOpenAi({
        apiKey: 'sk-test',
        model: 'gpt-5.4-mini',
        system: 'system prompt',
        user: '{"fen":"test"}',
        schema: responseSchema,
      }),
    ).rejects.toBeInstanceOf(OpenAiHttpError)
  })
})
