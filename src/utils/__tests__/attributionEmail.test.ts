import { describe, expect, test } from 'bun:test'
import { getAttributionEmail } from '../attributionEmail.js'

describe('getAttributionEmail', () => {
  test('uses Anthropic’s real noreply for Claude models', () => {
    for (const model of [
      'claude-opus-5',
      'Claude-Sonnet-5',
      'claude-haiku-4-5',
    ]) {
      expect(getAttributionEmail(model)).toBe('noreply@anthropic.com')
    }
  })

  test('never emits an address at a domain we do not own', () => {
    // The bug this replaces: nine addresses at upstream's domain, written into
    // the permanent public git history of anyone using a non-Claude model.
    const models = [
      'gpt-5.6',
      'gemini-3-pro',
      'grok-4',
      'glm-4.6',
      'deepseek-v3',
      'qwen-max',
      'minimax-m2',
      'mimo-7b',
      'kimi-k2',
      'something-nobody-has-heard-of',
    ]
    for (const model of models) {
      const email = getAttributionEmail(model)
      expect(email).not.toContain('claude-code-best')
      // .invalid is reserved by RFC 2606 and can never be registered, so the
      // trailer can never deliver mail to a real stranger.
      expect(email.endsWith('.invalid')).toBe(true)
    }
  })

  test('does not credit Anthropic for another vendor’s model', () => {
    expect(getAttributionEmail('gpt-5.6')).not.toBe('noreply@anthropic.com')
  })
})
