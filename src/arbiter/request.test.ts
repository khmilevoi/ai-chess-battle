import { describe, expect, it } from 'vitest'
import { DEFAULT_ARBITER_PERSONALITY_KEY } from './personalities'
import { buildArbiterInstructions, buildArbiterPrompt, parseArbiterResponseJson } from './request'

describe('arbiter request helpers', () => {
  it('builds the compact arbiter prompt payload from the latest position', () => {
    const prompt = buildArbiterPrompt({
      snapshot: {
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
        lastMove: {
          from: 'e7',
          to: 'e5',
          uci: 'e7e5',
        },
        history: ['e2e4', 'e7e5'],
      },
    })

    expect(JSON.parse(prompt)).toEqual({
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      lastMove: {
        side: 'black',
        uci: 'e7e5',
      },
      moveNumber: 2,
      recentHistory: ['e2e4', 'e7e5'],
    })
  })

  it('parses validated arbiter JSON responses', () => {
    expect(
      parseArbiterResponseJson('{"score": 87, "comment": "White has the cleaner files."}'),
    ).toEqual({
      score: 87,
      comment: 'White has the cleaner files.',
    })
  })

  it('combines personality instructions with the locked JSON contract', () => {
    const instructions = buildArbiterInstructions(DEFAULT_ARBITER_PERSONALITY_KEY)

    expect(instructions).toContain('classic chess arbiter')
    expect(instructions).toContain('exactly one short sentence')
    expect(instructions).toContain('Do not use markdown or long analysis.')
    expect(instructions).toContain('strict JSON')
    expect(instructions).toContain('"score"')
    expect(instructions).toContain('"comment"')
  })
})
