import { describe, expect, test } from 'bun:test'
import {
  extractJsonObject,
  normalizeColorValue,
  normalizeThemeColors,
} from '../generate/parseResponse.js'

describe('extractJsonObject', () => {
  test('reads a bare JSON object', () => {
    const out = extractJsonObject('{"mode":"dark"}')
    expect(out).toEqual({ ok: true, value: { mode: 'dark' } })
  })

  test('unwraps a ```json fence', () => {
    const out = extractJsonObject('```json\n{"mode":"dark"}\n```')
    expect(out.ok && out.value).toEqual({ mode: 'dark' })
  })

  test('unwraps an unlabelled fence', () => {
    const out = extractJsonObject('```\n{"mode":"light"}\n```')
    expect(out.ok && out.value).toEqual({ mode: 'light' })
  })

  test('digs the object out of surrounding prose', () => {
    // The most common real failure: "Here's your theme: {...} Enjoy!"
    const out = extractJsonObject(
      'Here is your theme:\n{"mode":"dark"}\nHope you like it!',
    )
    expect(out.ok && out.value).toEqual({ mode: 'dark' })
  })

  test('handles nested objects rather than stopping at the first brace', () => {
    const out = extractJsonObject(
      'Theme: {"mode":"dark","colors":{"text":"rgb(1,2,3)"}} done',
    )
    expect(out.ok && out.value).toEqual({
      mode: 'dark',
      colors: { text: 'rgb(1,2,3)' },
    })
  })

  test('is not fooled by a brace inside a string', () => {
    // A closing brace in the description would end the object early if we
    // counted braces without tracking strings.
    const out = extractJsonObject(
      '{"description":"has a } in it","mode":"dark"}',
    )
    expect(out.ok && (out.value as Record<string, unknown>).mode).toBe('dark')
  })

  test('is not fooled by an escaped quote', () => {
    const out = extractJsonObject('{"description":"a \\" quote","mode":"dark"}')
    expect(out.ok && (out.value as Record<string, unknown>).mode).toBe('dark')
  })

  test('rejects an empty response', () => {
    expect(extractJsonObject('   ').ok).toBe(false)
  })

  test('rejects a bare array, which is not a theme', () => {
    expect(extractJsonObject('[1,2,3]').ok).toBe(false)
  })

  test('rejects prose with no JSON in it', () => {
    const out = extractJsonObject("I'd rather not make a theme.")
    expect(out.ok).toBe(false)
  })
})

describe('normalizeColorValue', () => {
  test('tightens rgb spacing the renderer would reject', () => {
    // colorize.ts allows at most one space after a comma. The intent here is
    // not in doubt, so fixing it beats reporting it.
    expect(normalizeColorValue('rgb(1,  2,   3)')).toBe('rgb(1,2,3)')
    expect(normalizeColorValue('rgb( 10, 20, 30 )')).toBe('rgb(10,20,30)')
  })

  test('leaves already-valid rgb alone', () => {
    expect(normalizeColorValue('rgb(1, 2, 3)')).toBe('rgb(1,2,3)')
    expect(normalizeColorValue('rgb(1,2,3)')).toBe('rgb(1,2,3)')
  })

  test('lowercases hex for consistency in the saved file', () => {
    expect(normalizeColorValue('#AABBCC')).toBe('#aabbcc')
  })

  test('leaves values it cannot confidently fix', () => {
    // Guessing at a colour the author did not write is worse than reporting
    // that it was rejected.
    expect(normalizeColorValue('cornflowerblue')).toBe('cornflowerblue')
  })
})

describe('normalizeThemeColors', () => {
  test('normalises every colour in the map', () => {
    const out = normalizeThemeColors({
      mode: 'dark',
      colors: { text: 'rgb(1,  2,  3)', claude: '#ABCDEF' },
    }) as Record<string, Record<string, string>>

    expect(out.colors).toEqual({ text: 'rgb(1,2,3)', claude: '#abcdef' })
  })

  test('leaves non-string values for validation to report', () => {
    const out = normalizeThemeColors({
      mode: 'dark',
      colors: { text: 42 },
    }) as Record<string, Record<string, unknown>>

    expect(out.colors.text).toBe(42)
  })

  test('passes through anything that is not theme-shaped', () => {
    expect(normalizeThemeColors('nope')).toBe('nope')
    expect(normalizeThemeColors({ mode: 'dark' })).toEqual({ mode: 'dark' })
  })

  test('preserves the scene field alongside the colours', () => {
    // Generated animated themes ride on this: if normalisation dropped the
    // scene, /theme create could never land a theme in the Animated band.
    const out = normalizeThemeColors({
      mode: 'dark',
      scene: { kind: 'rain', params: { intensity: 0.55 } },
      colors: { text: 'rgb(1,2,3)' },
    }) as Record<string, unknown>

    expect(out.scene).toEqual({ kind: 'rain', params: { intensity: 0.55 } })
  })
})
