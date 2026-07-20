import { afterEach, describe, expect, test } from 'bun:test'
import { defaultPetalsParams, defaultRainParams } from '../../scene/types.js'
import { getTheme, isKnownTheme, unregisterTheme } from '../../utils/theme.js'
import { loadThemeFromText, resolveThemeColors } from '../loader.js'

// loadThemeFromText does not register; these only clean up if a test does.
const registered: string[] = []
afterEach(() => {
  while (registered.length > 0) {
    unregisterTheme(registered.pop()!)
  }
})

const MINIMAL = JSON.stringify({
  mode: 'dark',
  colors: { claude: 'rgb(0,255,65)' },
})

describe('a minimal theme file', () => {
  test('loads with just a mode and one colour', () => {
    const { theme, warnings } = loadThemeFromText('matrix', MINIMAL)

    expect(warnings).toEqual([])
    expect(theme).not.toBeNull()
    expect(theme!.mode).toBe('dark')
  })

  test('fills every unspecified slot from the mode built-in', () => {
    const { theme } = loadThemeFromText('matrix', MINIMAL)
    const dark = getTheme('dark') as unknown as Record<string, string>
    const loaded = theme!.theme as unknown as Record<string, string>

    expect(loaded.claude).toBe('rgb(0,255,65)') // authored
    expect(loaded.text).toBe(dark.text) // inherited
    expect(Object.keys(loaded).length).toBe(Object.keys(dark).length)
  })

  test('light mode inherits from the light built-in', () => {
    const { theme } = loadThemeFromText(
      'daylight',
      JSON.stringify({ mode: 'light', colors: {} }),
    )
    const light = getTheme('light') as unknown as Record<string, string>

    expect((theme!.theme as unknown as Record<string, string>).text).toBe(
      light.text,
    )
  })
})

describe('reserved names', () => {
  test('a file named after a built-in is refused, not registered', () => {
    const { theme, warnings } = loadThemeFromText('dark', MINIMAL)

    expect(theme).toBeNull()
    expect(warnings[0]).toMatchObject({
      type: 'reserved_name',
      severity: 'error',
    })
    // The shipped dark theme is untouched.
    expect(isKnownTheme('dark')).toBe(true)
  })

  test('the warning suggests a way out', () => {
    const { warnings } = loadThemeFromText('light', MINIMAL)
    expect(warnings[0]?.suggestion).toContain('light-custom')
  })
})

describe('malformed input degrades instead of throwing', () => {
  test('invalid JSON', () => {
    const { theme, warnings } = loadThemeFromText('broken', '{ not json')

    expect(theme).toBeNull()
    expect(warnings[0]).toMatchObject({
      type: 'parse_error',
      severity: 'error',
    })
  })

  test('a JSON array rather than an object', () => {
    const { theme, warnings } = loadThemeFromText('arr', '[]')
    expect(theme).toBeNull()
    expect(warnings[0]?.message).toContain('JSON object')
  })

  test('a missing mode is an error, since it decides everything else', () => {
    const { theme, warnings } = loadThemeFromText(
      'nomode',
      JSON.stringify({ colors: {} }),
    )

    expect(theme).toBeNull()
    expect(warnings[0]?.message).toContain('"mode"')
  })

  test('a bogus mode is rejected', () => {
    const { theme } = loadThemeFromText(
      'weird',
      JSON.stringify({ mode: 'sepia', colors: {} }),
    )
    expect(theme).toBeNull()
  })

  test('missing colors is an error', () => {
    const { theme, warnings } = loadThemeFromText(
      'nocolors',
      JSON.stringify({ mode: 'dark' }),
    )
    expect(theme).toBeNull()
    expect(warnings[0]?.message).toContain('"colors"')
  })
})

describe('individual bad fields are dropped, not fatal', () => {
  test('an unknown slot warns but the theme still loads', () => {
    const { theme, warnings } = loadThemeFromText(
      'typo',
      JSON.stringify({
        mode: 'dark',
        colors: { txet: 'rgb(1,2,3)', claude: 'rgb(0,255,65)' },
      }),
    )

    expect(theme).not.toBeNull()
    expect((theme!.theme as unknown as Record<string, string>).claude).toBe(
      'rgb(0,255,65)',
    )
    expect(warnings.some(w => w.type === 'unknown_slot')).toBe(true)
  })

  test('a non-string colour value warns but the theme still loads', () => {
    const { theme, warnings } = loadThemeFromText(
      'oops',
      JSON.stringify({ mode: 'dark', colors: { claude: 42 } }),
    )

    expect(theme).not.toBeNull()
    expect(warnings.some(w => w.type === 'invalid_field')).toBe(true)
  })

  test('an unparseable colour is reported', () => {
    const { theme, warnings } = loadThemeFromText(
      'badcolour',
      JSON.stringify({ mode: 'dark', colors: { claude: 'rebeccapurple' } }),
    )

    // Still loads — one bad slot should not cost the user their theme.
    expect(theme).not.toBeNull()
    expect(warnings.some(w => w.message.includes('uncoloured'))).toBe(true)
  })
})

describe('duplicate slot keys', () => {
  test('are surfaced, since JSON.parse silently keeps only the last', () => {
    const text = `{
      "mode": "dark",
      "colors": {
        "claude": "rgb(1,2,3)",
        "claude": "rgb(9,9,9)"
      }
    }`
    const { theme, warnings } = loadThemeFromText('dupe', text)

    expect(theme).not.toBeNull()
    const dupe = warnings.find(w => w.type === 'duplicate_key')
    expect(dupe?.message).toContain('claude')
  })
})

describe('colour repair on load', () => {
  test('near-invisible text is brightened and the change is reported', () => {
    const { theme, warnings } = loadThemeFromText(
      'toodark',
      JSON.stringify({ mode: 'dark', colors: { text: 'rgb(28,28,28)' } }),
    )

    const loaded = theme!.theme as unknown as Record<string, string>
    expect(loaded.text).not.toBe('rgb(28,28,28)')
    expect(warnings.some(w => w.message.includes('brightened'))).toBe(true)
  })
})

describe('the scene field', () => {
  test('kind "none" is accepted silently', () => {
    const { theme, warnings } = loadThemeFromText(
      'scenic',
      JSON.stringify({ mode: 'dark', colors: {}, scene: { kind: 'none' } }),
    )

    expect(theme).not.toBeNull()
    expect(warnings).toEqual([])
    expect(theme!.scene).toEqual({ kind: 'none' })
  })

  test('rain loads with every param defaulted', () => {
    const { theme, warnings } = loadThemeFromText(
      'rainy',
      JSON.stringify({ mode: 'dark', colors: {}, scene: { kind: 'rain' } }),
    )

    expect(warnings).toEqual([])
    expect(theme!.scene).toEqual({ kind: 'rain', params: defaultRainParams() })
  })

  test('petals load with authored params where given, defaults elsewhere', () => {
    const { theme, warnings } = loadThemeFromText(
      'blossom',
      JSON.stringify({
        mode: 'dark',
        colors: {},
        scene: { kind: 'petals', params: { density: 12 } },
      }),
    )

    expect(warnings).toEqual([])
    expect(theme!.scene).toEqual({
      kind: 'petals',
      params: { ...defaultPetalsParams(), density: 12 },
    })
  })

  test('out-of-range params are clamped with a warning, never fatal', () => {
    const { theme, warnings } = loadThemeFromText(
      'flood',
      JSON.stringify({
        mode: 'dark',
        colors: {},
        scene: { kind: 'rain', params: { density: 99 } },
      }),
    )

    expect(theme).not.toBeNull()
    expect(theme!.scene).toMatchObject({ kind: 'rain', params: { density: 1 } })
    expect(warnings.some(w => w.message.includes('clamped'))).toBe(true)
  })

  test('a non-numeric param falls back to the default with a warning', () => {
    const { theme, warnings } = loadThemeFromText(
      'stringy',
      JSON.stringify({
        mode: 'dark',
        colors: {},
        scene: { kind: 'rain', params: { density: 'lots' } },
      }),
    )

    expect(theme!.scene).toMatchObject({
      kind: 'rain',
      params: { density: defaultRainParams().density },
    })
    expect(warnings.some(w => w.message.includes('must be a number'))).toBe(
      true,
    )
  })

  test('unknown params are dropped with a warning', () => {
    const { warnings } = loadThemeFromText(
      'extra',
      JSON.stringify({
        mode: 'dark',
        colors: {},
        scene: { kind: 'rain', params: { splashiness: 5 } },
      }),
    )
    expect(warnings.some(w => w.message.includes('splashiness'))).toBe(true)
  })

  test('an unknown scene kind warns and loads without an animation', () => {
    // Forward compatibility: a theme written for a newer build still loads.
    const { theme, warnings } = loadThemeFromText(
      'futuristic',
      JSON.stringify({ mode: 'dark', colors: {}, scene: { kind: 'lava' } }),
    )

    expect(theme).not.toBeNull()
    expect(theme!.scene).toBeUndefined()
    expect(warnings.some(w => w.message.includes('lava'))).toBe(true)
  })
})

describe('resolveThemeColors', () => {
  test('authored slots win over the built-in', () => {
    const resolved = resolveThemeColors({
      mode: 'dark',
      colors: { text: 'rgb(1,1,1)' },
    })
    expect(resolved.text).toBe('rgb(1,1,1)')
  })

  test('produces a complete palette from an empty colours block', () => {
    const resolved = resolveThemeColors({ mode: 'dark', colors: {} })
    const dark = getTheme('dark') as unknown as Record<string, string>
    expect(resolved).toEqual(dark)
  })
})

describe('load warnings are cached for the UI', () => {
  test('a rejected file is reportable rather than silently missing', async () => {
    // The gap this closes: a theme file with the wrong shape produced a good
    // error message that only ever reached the debug log, so from the author's
    // side the theme just never appeared.
    const { getCachedThemeWarnings, loadUserThemes } = await import(
      '../loader.js'
    )

    const result = await loadUserThemes()

    // The cache must be exactly what the load produced, so whatever the picker
    // renders is what actually happened rather than a stale snapshot.
    expect(getCachedThemeWarnings()).toEqual(result.warnings)
  })

  test('the cache is replaced, not appended to, across loads', async () => {
    // Otherwise fixing a broken theme file would leave its error on screen
    // forever.
    const { getCachedThemeWarnings, loadUserThemes } = await import(
      '../loader.js'
    )

    await loadUserThemes()
    const first = getCachedThemeWarnings().length
    await loadUserThemes()

    expect(getCachedThemeWarnings().length).toBe(first)
  })
})
