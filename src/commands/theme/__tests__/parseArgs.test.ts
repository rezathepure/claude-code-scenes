import { describe, expect, test } from 'bun:test'
import { parseThemeArgs, themeNameFromDescription } from '../parseArgs'

describe('parseThemeArgs', () => {
  test('no arguments opens the picker', () => {
    expect(parseThemeArgs('')).toEqual({ kind: 'picker' })
    expect(parseThemeArgs('   ')).toEqual({ kind: 'picker' })
  })

  test('create takes the rest of the line as the description', () => {
    expect(parseThemeArgs('create a Spiderman fan')).toEqual({
      kind: 'create',
      description: 'a Spiderman fan',
    })
  })

  test('preserves internal spacing and punctuation in the description', () => {
    // The description is prose handed to a model; collapsing whitespace or
    // stripping punctuation would change what the user asked for.
    const parsed = parseThemeArgs(
      'create  deep-sea bioluminescence, mostly blue-green',
    )
    expect(parsed).toEqual({
      kind: 'create',
      description: 'deep-sea bioluminescence, mostly blue-green',
    })
  })

  test('is case-insensitive about the subcommand', () => {
    expect(parseThemeArgs('CREATE a vibe')).toMatchObject({ kind: 'create' })
  })

  test('create with no description explains what to do', () => {
    const parsed = parseThemeArgs('create')
    expect(parsed.kind).toBe('error')
    if (parsed.kind === 'error') {
      expect(parsed.message).toContain('/theme create')
    }
  })

  test('an unknown subcommand is quoted back with the valid forms', () => {
    const parsed = parseThemeArgs('frobnicate matrix')
    expect(parsed.kind).toBe('error')
    if (parsed.kind === 'error') {
      expect(parsed.message).toContain('frobnicate')
      expect(parsed.message).toContain('/theme create')
    }
  })
})

describe('themeNameFromDescription', () => {
  test('produces a readable, filename-safe name', () => {
    expect(themeNameFromDescription('a moody vampire castle')).toBe(
      'moody-vampire-castle',
    )
  })

  test('drops filler words so the name stays meaningful', () => {
    expect(themeNameFromDescription('a theme for me like Spiderman')).toBe(
      'spiderman',
    )
  })

  test('strips characters that are unsafe in a filename', () => {
    const name = themeNameFromDescription('Blade Runner 2049: neon & rain')
    expect(name).toMatch(/^[a-z0-9-]+$/)
  })

  test('never returns an empty name', () => {
    // Would otherwise produce a file called ".json".
    expect(themeNameFromDescription('the a an')).toBe('custom-theme')
    expect(themeNameFromDescription('!!!')).toBe('custom-theme')
  })

  test('stays short enough to be a comfortable filename', () => {
    const long = themeNameFromDescription(
      'an extraordinarily elaborate description that simply will not stop going on',
    )
    expect(long.length).toBeLessThanOrEqual(40)
  })
})

describe('export and delete subcommands', () => {
  test('export takes a theme name', () => {
    expect(parseThemeArgs('export dark')).toEqual({
      kind: 'export',
      source: 'dark',
    })
  })

  test('delete takes a theme name', () => {
    expect(parseThemeArgs('delete eee')).toEqual({
      kind: 'delete',
      name: 'eee',
    })
  })

  test('each explains itself when given no name', () => {
    for (const sub of ['export', 'delete']) {
      const parsed = parseThemeArgs(sub)
      expect(parsed.kind).toBe('error')
      if (parsed.kind === 'error') {
        expect(parsed.message).toContain(`/theme ${sub}`)
      }
    }
  })

  test('the unknown-subcommand message lists every form', () => {
    const parsed = parseThemeArgs('frobnicate x')
    expect(parsed.kind).toBe('error')
    if (parsed.kind === 'error') {
      expect(parsed.message).toContain('create')
      expect(parsed.message).toContain('export')
      expect(parsed.message).toContain('delete')
    }
  })
})
