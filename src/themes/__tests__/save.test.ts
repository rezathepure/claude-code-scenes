import { afterEach, describe, expect, test } from 'bun:test'
import { getTheme, registerTheme, unregisterTheme } from '../../utils/theme.js'
import { findAvailableThemeName, serializeThemeFile } from '../save.js'
import { loadThemeFromText } from '../loader.js'
import { defaultPetalsParams, defaultRainParams } from '../../scene/types.js'

const registered: string[] = []
function register(name: string): void {
  registered.push(name)
  registerTheme(name, getTheme('dark'))
}
afterEach(() => {
  while (registered.length > 0) {
    unregisterTheme(registered.pop()!)
  }
})

describe('findAvailableThemeName', () => {
  test('uses the preferred name when it is free', () => {
    expect(findAvailableThemeName('test-only-free-name')).toBe(
      'test-only-free-name',
    )
  })

  test('never returns a reserved built-in name', () => {
    // Would be rejected by the loader on the next launch, stranding the theme.
    expect(findAvailableThemeName('dark')).not.toBe('dark')
    expect(findAvailableThemeName('light')).not.toBe('light')
  })

  test('suffixes rather than overwriting an existing theme', () => {
    // Generating "spiderman" twice should leave the user with two themes, not
    // silently destroy the first.
    register('test-only-taken')
    expect(findAvailableThemeName('test-only-taken')).toBe('test-only-taken-2')
  })

  test('keeps counting past the first collision', () => {
    register('test-only-busy')
    register('test-only-busy-2')
    expect(findAvailableThemeName('test-only-busy')).toBe('test-only-busy-3')
  })
})

describe('serializeThemeFile', () => {
  const file = serializeThemeFile({
    mode: 'dark',
    description: 'Web-slinger red and blue',
    colors: { claude: 'rgb(230,36,41)' },
  })

  test('writes the documented theme-file shape', () => {
    const parsed = JSON.parse(file)
    expect(parsed.mode).toBe('dark')
    expect(parsed.description).toBe('Web-slinger red and blue')
    expect(parsed.colors.claude).toBe('rgb(230,36,41)')
  })

  test('reserves the scene field so the file needs no migration later', () => {
    expect(JSON.parse(file).scene).toEqual({ kind: 'none' })
  })

  test('is indented and newline-terminated, since people will edit it', () => {
    expect(file).toContain('\n  "mode"')
    expect(file.endsWith('\n')).toBe(true)
  })

  test('omits description entirely when there is none', () => {
    const bare = JSON.parse(serializeThemeFile({ mode: 'light', colors: {} }))
    expect('description' in bare).toBe(false)
  })
})

describe('scene passthrough', () => {
  test('a theme with a scene keeps it when serialized', () => {
    // The bug this locks against: serializeThemeFile used to hardcode
    // scene:'none', so /theme export silently stripped animations.
    const file = serializeThemeFile({
      mode: 'dark',
      colors: {},
      scene: { kind: 'rain', params: defaultRainParams() },
    })
    const parsed = JSON.parse(file)
    expect(parsed.scene.kind).toBe('rain')
    expect(parsed.scene.params.density).toBe(defaultRainParams().density)
  })

  test('and round-trips through the loader unchanged', () => {
    const file = serializeThemeFile({
      mode: 'dark',
      colors: {},
      scene: { kind: 'petals', params: defaultPetalsParams() },
    })
    const { theme, warnings } = loadThemeFromText('round-trip-scene', file)
    expect(warnings).toEqual([])
    expect(theme!.scene).toEqual({
      kind: 'petals',
      params: defaultPetalsParams(),
    })
  })
})
