import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const anthropicMock = vi.hoisted(() => {
  class MockApiError extends Error {
    status?: number

    constructor(message: string, status?: number) {
      super(message)
      this.name = 'APIError'
      this.status = status
    }
  }

  const parse = vi.fn()
  const Anthropic = vi.fn(function MockAnthropic() {
    return {
      messages: {
        parse,
      },
    }
  })
  const zodOutputFormat = vi.fn((schema: unknown) => ({ schema }))

  return {
    APIError: MockApiError,
    Anthropic,
    parse,
    zodOutputFormat,
  }
})

vi.mock('@anthropic-ai/sdk', () => ({
  default: anthropicMock.Anthropic,
  APIError: anthropicMock.APIError,
}))

vi.mock('@anthropic-ai/sdk/helpers/zod', () => ({
  zodOutputFormat: anthropicMock.zodOutputFormat,
}))

import { AnthropicHttpError } from './errors'
import { callAnthropic } from './call'

const responseSchema = z.object({
  score: z.number().int(),
  comment: z.string(),
})

describe('callAnthropic', () => {
  beforeEach(() => {
    anthropicMock.Anthropic.mockClear()
    anthropicMock.parse.mockReset()
    anthropicMock.zodOutputFormat.mockClear()
  })

  it('returns schema-validated parsed output', async () => {
    anthropicMock.parse.mockResolvedValue({
      parsed_output: {
        score: -38,
        comment: 'Black found a clean equalizer.',
      },
    })

    const result = await callAnthropic({
      apiKey: 'test-key',
      model: 'claude-sonnet-4-6',
      system: 'system prompt',
      user: '{"fen":"test"}',
      schema: responseSchema,
      providerOptions: {
        effort: 'medium',
        thinking: 'adaptive',
      },
    })

    expect(result).toEqual({
      score: -38,
      comment: 'Black found a clean equalizer.',
    })
    expect(anthropicMock.Anthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-key',
        dangerouslyAllowBrowser: true,
        maxRetries: 2,
      }),
    )
    expect(anthropicMock.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-6',
        system: 'system prompt',
        messages: [
          {
            role: 'user',
            content: '{"fen":"test"}',
          },
        ],
        output_config: expect.objectContaining({
          effort: 'medium',
          format: expect.any(Object),
        }),
        thinking: {
          type: 'adaptive',
        },
      }),
      { signal: undefined },
    )
  })

  it('maps sdk http failures to AnthropicHttpError', async () => {
    anthropicMock.parse.mockRejectedValue(
      new anthropicMock.APIError('Forbidden', 403),
    )

    await expect(
      callAnthropic({
        apiKey: 'test-key',
        model: 'claude-sonnet-4-6',
        system: 'system prompt',
        user: '{"fen":"test"}',
        schema: responseSchema,
      }),
    ).rejects.toBeInstanceOf(AnthropicHttpError)
  })
})
