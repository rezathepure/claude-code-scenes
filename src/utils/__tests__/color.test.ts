import { describe, expect, test } from 'bun:test'
import { isTerminalPaletteColor, parseColor } from '../color'

describe('parseColor', () => {
  test('parses rgb() with no spaces', () => {
    expect(parseColor('rgb(0,255,65)')).toEqual({ r: 0, g: 255, b: 65 })
  })

  test('parses rgb() with a single space after each comma', () => {
    expect(parseColor('rgb(255, 138, 190)')).toEqual({
      r: 255,
      g: 138,
      b: 190,
    })
  })

  test('rejects rgb() with more than one space, matching the renderer', () => {
    // colorize.ts uses `\s?`, so this value renders as uncoloured text. The
    // validator must reject it rather than pass a value that will not paint.
    expect(parseColor('rgb(255,  138,  190)')).toBeNull()
  })

  test('rejects out-of-range channels instead of silently clamping', () => {
    expect(parseColor('rgb(300,0,0)')).toBeNull()
  })

  test('parses full hex', () => {
    expect(parseColor('#00ff41')).toEqual({ r: 0, g: 255, b: 65 })
  })

  test('parses shorthand hex by doubling each digit', () => {
    expect(parseColor('#0f4')).toEqual({ r: 0, g: 255, b: 68 })
  })

  test('is case-insensitive for hex', () => {
    expect(parseColor('#00FF41')).toEqual(parseColor('#00ff41'))
  })

  test('rejects malformed hex', () => {
    expect(parseColor('#gggggg')).toBeNull()
    expect(parseColor('#12345')).toBeNull()
  })

  test('resolves the 16 named ANSI colours', () => {
    expect(parseColor('ansi:redBright')).toEqual({ r: 255, g: 0, b: 0 })
    expect(parseColor('ansi:black')).toEqual({ r: 0, g: 0, b: 0 })
  })

  test('rejects an unknown ANSI name', () => {
    expect(parseColor('ansi:chartreuse')).toBeNull()
  })

  test('resolves ansi256 low range to the named palette', () => {
    // Index 9 is redBright; the low 16 must agree with the ansi: names.
    expect(parseColor('ansi256(9)')).toEqual(parseColor('ansi:redBright'))
    expect(parseColor('ansi256(0)')).toEqual(parseColor('ansi:black'))
  })

  test('resolves the 6x6x6 colour cube', () => {
    // 16 is the cube origin (black); 231 is its opposite corner (white).
    expect(parseColor('ansi256(16)')).toEqual({ r: 0, g: 0, b: 0 })
    expect(parseColor('ansi256(231)')).toEqual({ r: 255, g: 255, b: 255 })
  })

  test('resolves the greyscale ramp', () => {
    expect(parseColor('ansi256(232)')).toEqual({ r: 8, g: 8, b: 8 })
    expect(parseColor('ansi256(255)')).toEqual({ r: 238, g: 238, b: 238 })
  })

  test('rejects an out-of-range palette index', () => {
    expect(parseColor('ansi256(256)')).toBeNull()
  })

  test('returns null for values the renderer would not colour', () => {
    expect(parseColor('rebeccapurple')).toBeNull()
    expect(parseColor('')).toBeNull()
    expect(parseColor('rgb(1,2)')).toBeNull()
  })
})

describe('isTerminalPaletteColor', () => {
  test('is true for terminal-defined values', () => {
    expect(isTerminalPaletteColor('ansi:red')).toBe(true)
    expect(isTerminalPaletteColor('ansi256(42)')).toBe(true)
  })

  test('is false for values we fully control', () => {
    expect(isTerminalPaletteColor('rgb(0,0,0)')).toBe(false)
    expect(isTerminalPaletteColor('#000000')).toBe(false)
  })
})

describe('parseColor against the shipped themes', () => {
  // The real guarantee: every colour in every built-in theme must parse.
  // If one does not, it is rendering as uncoloured text right now.
  test('every value in every built-in theme parses', async () => {
    const { getTheme, THEME_NAMES } = await import('@anthropic/ink/theme-types')

    const failures: string[] = []
    for (const themeName of THEME_NAMES) {
      const theme = getTheme(themeName)
      for (const [slot, value] of Object.entries(theme)) {
        if (typeof value === 'string' && parseColor(value) === null) {
          failures.push(`${themeName}.${slot} = ${JSON.stringify(value)}`)
        }
      }
    }

    expect(failures).toEqual([])
  })
})
