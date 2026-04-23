import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const googleMock = vi.hoisted(() => {
  const generateContent = vi.fn()
  const GoogleGenAI = vi.fn(function MockGoogleGenAI() {
    return {
      models: {
        generateContent,
      },
    }
  })

  return {
    generateContent,
    GoogleGenAI,
  }
})

vi.mock('@google/genai', () => ({
  GoogleGenAI: googleMock.GoogleGenAI,
}))

import { GoogleGenAiHttpError } from './errors'
import { callGoogle } from './call'

const responseSchema = z.object({
  score: z.number().int(),
  comment: z.string(),
})

describe('callGoogle', () => {
  beforeEach(() => {
    googleMock.GoogleGenAI.mockClear()
    googleMock.generateContent.mockReset()
  })

  it('returns schema-validated parsed output', async () => {
    googleMock.generateContent.mockResolvedValue({
      text: JSON.stringify({
        score: 77,
        comment: 'White keeps the initiative humming.',
      }),
    })

    const result = await callGoogle({
      apiKey: 'google-test',
      model: 'gemini-2.5-flash',
      system: 'system prompt',
      user: '{"fen":"test"}',
      schema: responseSchema,
    })

    expect(result).toEqual({
      score: 77,
      comment: 'White keeps the initiative humming.',
    })
    expect(googleMock.GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'google-test',
    })
    expect(googleMock.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash',
        contents: '{"fen":"test"}',
        config: expect.objectContaining({
          systemInstruction: 'system prompt',
          responseMimeType: 'application/json',
          responseJsonSchema: expect.any(Object),
        }),
      }),
    )
  })

  it('maps sdk http failures to GoogleGenAiHttpError', async () => {
    googleMock.generateContent.mockRejectedValue(
      Object.assign(new Error('Too many requests'), { status: 429 }),
    )

    await expect(
      callGoogle({
        apiKey: 'google-test',
        model: 'gemini-2.5-flash',
        system: 'system prompt',
        user: '{"fen":"test"}',
        schema: responseSchema,
      }),
    ).rejects.toBeInstanceOf(GoogleGenAiHttpError)
  })
})
