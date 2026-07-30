import { describe, expect, test } from 'bun:test'
import { firstPartyNameToCanonical } from '../model'

describe('firstPartyNameToCanonical', () => {
  // The Claude 5 generation uses dateless single-digit IDs, which the regex
  // fallback at the bottom of the function cannot parse — it reads
  // 'claude-opus-5' as 'claude-opus'. That wrong answer is silent: it matches
  // no cost, 1M, effort or knowledge-cutoff lookup, so every one of them quietly
  // returns a default. These cases exist so the fallback can never swallow them
  // again.
  test('maps claude-opus-5, not claude-opus', () => {
    expect(firstPartyNameToCanonical('claude-opus-5')).toBe('claude-opus-5')
  })

  test('maps claude-sonnet-5, not claude-sonnet', () => {
    expect(firstPartyNameToCanonical('claude-sonnet-5')).toBe('claude-sonnet-5')
  })

  test('maps claude-fable-5, not claude-fable', () => {
    expect(firstPartyNameToCanonical('claude-fable-5')).toBe('claude-fable-5')
  })

  test('distinguishes opus-4-8 from the opus-4 catch-all', () => {
    // The highest-value case here. 'claude-opus-4-8' satisfies
    // .includes('opus-4'), so if it falls through to that arm it is priced,
    // sized and dated as Opus 4 — 32k max output instead of 128k, and a
    // knowledge cutoff eighteen months early.
    expect(firstPartyNameToCanonical('claude-opus-4-8')).toBe('claude-opus-4-8')
    expect(firstPartyNameToCanonical('claude-opus-4-8')).not.toBe(
      'claude-opus-4',
    )
  })

  test('maps the 5 generation through 3P provider wrappers', () => {
    expect(firstPartyNameToCanonical('us.anthropic.claude-opus-5')).toBe(
      'claude-opus-5',
    )
    expect(firstPartyNameToCanonical('claude-sonnet-5@20260101')).toBe(
      'claude-sonnet-5',
    )
    expect(firstPartyNameToCanonical('us.anthropic.claude-fable-5')).toBe(
      'claude-fable-5',
    )
    expect(firstPartyNameToCanonical('us.anthropic.claude-opus-4-8')).toBe(
      'claude-opus-4-8',
    )
  })

  test('maps opus-4-6 full name to canonical', () => {
    expect(firstPartyNameToCanonical('claude-opus-4-6-20250514')).toBe(
      'claude-opus-4-6',
    )
  })

  test('maps sonnet-4-6 full name', () => {
    expect(firstPartyNameToCanonical('claude-sonnet-4-6-20250514')).toBe(
      'claude-sonnet-4-6',
    )
  })

  test('maps haiku-4-5', () => {
    expect(firstPartyNameToCanonical('claude-haiku-4-5-20251001')).toBe(
      'claude-haiku-4-5',
    )
  })

  test('maps 3P provider format', () => {
    expect(firstPartyNameToCanonical('us.anthropic.claude-opus-4-6-v1:0')).toBe(
      'claude-opus-4-6',
    )
  })

  test('maps claude-3-7-sonnet', () => {
    expect(firstPartyNameToCanonical('claude-3-7-sonnet-20250219')).toBe(
      'claude-3-7-sonnet',
    )
  })

  test('maps claude-3-5-sonnet', () => {
    expect(firstPartyNameToCanonical('claude-3-5-sonnet-20241022')).toBe(
      'claude-3-5-sonnet',
    )
  })

  test('maps claude-3-5-haiku', () => {
    expect(firstPartyNameToCanonical('claude-3-5-haiku-20241022')).toBe(
      'claude-3-5-haiku',
    )
  })

  test('maps claude-3-opus', () => {
    expect(firstPartyNameToCanonical('claude-3-opus-20240229')).toBe(
      'claude-3-opus',
    )
  })

  test('is case insensitive', () => {
    expect(firstPartyNameToCanonical('Claude-Opus-4-6-20250514')).toBe(
      'claude-opus-4-6',
    )
  })

  test('falls back to input for unknown model', () => {
    expect(firstPartyNameToCanonical('unknown-model')).toBe('unknown-model')
  })

  test('differentiates opus-4 vs opus-4-5 vs opus-4-6', () => {
    expect(firstPartyNameToCanonical('claude-opus-4-20240101')).toBe(
      'claude-opus-4',
    )
    expect(firstPartyNameToCanonical('claude-opus-4-5-20240101')).toBe(
      'claude-opus-4-5',
    )
    expect(firstPartyNameToCanonical('claude-opus-4-6-20240101')).toBe(
      'claude-opus-4-6',
    )
  })

  test('maps opus-4-1', () => {
    expect(firstPartyNameToCanonical('claude-opus-4-1-20240101')).toBe(
      'claude-opus-4-1',
    )
  })

  test('maps sonnet-4-5', () => {
    expect(firstPartyNameToCanonical('claude-sonnet-4-5-20240101')).toBe(
      'claude-sonnet-4-5',
    )
  })

  test('maps sonnet-4', () => {
    expect(firstPartyNameToCanonical('claude-sonnet-4-20240101')).toBe(
      'claude-sonnet-4',
    )
  })
})
