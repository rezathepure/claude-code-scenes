import { describe, expect, test } from 'bun:test'
import { getTheme, isKnownTheme } from '../../utils/theme.js'
import { getBundledThemeNames } from '../bundled/index.js'
import { registerStarterThemesForTest } from './registerStarters.js'
import { parseColor } from '../../utils/color.js'
import { getSceneConfig } from '../../scene/registry.js'
import { defaultRainParams } from '../../scene/types.js'

describe('bundled themes', () => {
  const warnings = registerStarterThemesForTest()

  test('load through the real pipeline with no warnings at all', () => {
    // Matrix and Sakura are the worked examples the generator must match. Any
    // warning here means the pipeline cannot carry a hand-designed theme, and
    // so could not carry a generated one either.
    expect(warnings).toEqual([])
  })

  test('are registered and selectable', () => {
    for (const name of getBundledThemeNames()) {
      expect(isKnownTheme(name)).toBe(true)
    }
  })

  test('produce a complete palette, not a partial one', () => {
    const dark = getTheme('dark') as unknown as Record<string, string>
    for (const name of getBundledThemeNames()) {
      const theme = getTheme(name) as unknown as Record<string, string>
      expect(Object.keys(theme).sort()).toEqual(Object.keys(dark).sort())
    }
  })

  test('every colour parses, so nothing renders uncoloured', () => {
    for (const name of getBundledThemeNames()) {
      const theme = getTheme(name) as unknown as Record<string, string>
      const bad = Object.entries(theme)
        .filter(([, v]) => typeof v === 'string' && parseColor(v) === null)
        .map(([k, v]) => `${name}.${k}=${v}`)
      expect(bad).toEqual([])
    }
  })

  test('actually differ from the built-in dark theme', () => {
    // Guards against a bug where slot-filling silently wins over the authored
    // colours and every bundled theme comes out looking like `dark`.
    const dark = getTheme('dark') as unknown as Record<string, string>
    for (const name of getBundledThemeNames()) {
      const theme = getTheme(name) as unknown as Record<string, string>
      const differing = Object.keys(dark).filter(k => theme[k] !== dark[k])
      expect(differing.length).toBeGreaterThan(20)
    }
  })

  test('keep their identity colours exactly as authored', () => {
    const matrix = getTheme('matrix') as unknown as Record<string, string>
    const sakura = getTheme('sakura') as unknown as Record<string, string>

    // If validation had repaired these, the themes would not look like their
    // specs any more.
    expect(matrix.claude).toBe('rgb(0,255,65)')
    expect(matrix.text).toBe('rgb(200,245,205)')
    expect(sakura.claude).toBe('rgb(255,138,190)')
    expect(sakura.text).toBe('rgb(250,236,244)')
  })

  test('do not inherit brand colours from the dark theme', () => {
    // The subtle failure mode of slot-filling: a green theme keeping Claude
    // orange for its shimmer, which looks broken rather than merely wrong.
    const dark = getTheme('dark') as unknown as Record<string, string>
    for (const name of getBundledThemeNames()) {
      const theme = getTheme(name) as unknown as Record<string, string>
      expect(theme.claudeShimmer).not.toBe(dark.claudeShimmer)
      expect(theme.promptBorderShimmer).not.toBe(dark.promptBorderShimmer)
    }
  })
})

describe('bundled scenes', () => {
  test('matrix rains, sakura drifts, parchment stays still', () => {
    registerStarterThemesForTest()
    expect(getSceneConfig('matrix').kind).toBe('rain')
    expect(getSceneConfig('sakura').kind).toBe('petals')
    expect(getSceneConfig('parchment').kind).toBe('none')
  })

  test('bundled scene params are complete after loading', () => {
    registerStarterThemesForTest()
    const rain = getSceneConfig('matrix')
    if (rain.kind !== 'rain') throw new Error('expected rain')
    // Matrix deliberately runs quieter than the primitive's default — full
    // strength competes with the conversation text. Everything else parsing
    // did not find in the file must be default-filled.
    expect(rain.params).toEqual({ ...defaultRainParams(), intensity: 0.55 })
  })
})
