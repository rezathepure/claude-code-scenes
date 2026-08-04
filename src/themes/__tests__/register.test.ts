import { afterEach, describe, expect, test } from 'bun:test'
import { ColorFile } from 'color-diff-napi'
import { getTheme, isKnownTheme } from '../../utils/theme.js'
import { getBundledThemeNames } from '../bundled/index.js'
import { registerStarterThemesForTest } from './registerStarters.js'
import {
  registerThemeWithTraits,
  unregisterThemeWithTraits,
} from '../register.js'

const registered: string[] = []
function register(name: string, mode: 'dark' | 'light'): void {
  registered.push(name)
  registerThemeWithTraits(name, getTheme(mode), mode)
}
afterEach(() => {
  while (registered.length > 0) {
    unregisterThemeWithTraits(registered.pop()!)
  }
})

/**
 * Renders a snippet and returns the raw ANSI, which encodes which syntax
 * palette was chosen. Comparing renders tells us how a theme was classified
 * without asserting on specific colour values.
 */
function renderWith(themeName: string): string {
  const out = new ColorFile('const x = 1\n', 'x.ts').render(
    themeName,
    80,
    false,
  )
  return (out ?? []).join('\n')
}

describe('registering a theme also registers its syntax traits', () => {
  // Regression test for a bug found in the first live run: a generated theme
  // called "moody-vampire-castle" rendered diffs with pale pink and green line
  // fills on a dark background. The palette registry knew it was dark, but
  // color-diff-napi did not, so it fell back to reading the traits out of the
  // NAME — which contains neither "dark" nor "light" — and served the GitHub
  // light syntax palette.

  test('a dark theme with an unrelated name gets the dark syntax palette', () => {
    register('moody-vampire-castle', 'dark')

    expect(renderWith('moody-vampire-castle')).toBe(renderWith('dark'))
    expect(renderWith('moody-vampire-castle')).not.toBe(renderWith('light'))
  })

  test('a light theme with an unrelated name gets the light syntax palette', () => {
    register('sunlit-meadow', 'light')

    expect(renderWith('sunlit-meadow')).toBe(renderWith('light'))
    expect(renderWith('sunlit-meadow')).not.toBe(renderWith('dark'))
  })

  test('unregistering clears the traits too', () => {
    registerThemeWithTraits('temp-crimson-theme', getTheme('dark'), 'dark')
    expect(renderWith('temp-crimson-theme')).toBe(renderWith('dark'))

    unregisterThemeWithTraits('temp-crimson-theme')

    // Back to name-sniffing. The name must not itself contain "dark" or
    // "light", or the fallback would happen to guess right and prove nothing.
    expect(isKnownTheme('temp-crimson-theme')).toBe(false)
    expect(renderWith('temp-crimson-theme')).toBe(renderWith('light'))
  })

  test('an ANSI palette is detected and gets the ANSI syntax palette', () => {
    registerThemeWithTraits('terminal-native', getTheme('dark-ansi'), 'dark')
    registered.push('terminal-native')

    expect(renderWith('terminal-native')).toBe(renderWith('dark-ansi'))
  })
})

describe('the bundled themes are classified correctly', () => {
  registerStarterThemesForTest()

  // None of these names contains "dark" or "light", so every one of them was
  // affected by the name-sniffing bug. Listed explicitly rather than derived,
  // so a theme shipped with the wrong mode fails here.
  const expected: Array<[string, 'dark' | 'light']> = [
    ['matrix', 'dark'],
    ['sakura', 'dark'],
    ['winter', 'dark'],
    ['parchment', 'light'],
    ['voltage', 'dark'],
  ]

  test('covers every bundled theme', () => {
    expect(expected.map(([n]) => n).sort()).toEqual(
      getBundledThemeNames().sort(),
    )
  })

  for (const [name, mode] of expected) {
    test(`${name} gets ${mode} syntax highlighting`, () => {
      const opposite = mode === 'dark' ? 'light' : 'dark'
      expect(renderWith(name)).toBe(renderWith(mode))
      expect(renderWith(name)).not.toBe(renderWith(opposite))
    })
  }
})

describe('theme meta lifecycle', () => {
  test('register sets origin and authoritative mode; unregister clears', async () => {
    const { getThemeMeta, getThemeOrigin } = await import('../meta.js')

    registerThemeWithTraits(
      'test-only-meta',
      getTheme('dark'),
      'dark',
      undefined,
      {
        origin: 'official',
        description: 'imported',
      },
    )
    registered.push('test-only-meta')

    expect(getThemeMeta('test-only-meta')).toEqual({
      origin: 'official',
      mode: 'dark',
      description: 'imported',
    })

    unregisterThemeWithTraits('test-only-meta')
    registered.pop()
    expect(getThemeMeta('test-only-meta')).toBeUndefined()
    // Fallbacks after clearing: builtins are builtin, unknowns default to cc.
    expect(getThemeOrigin('dark')).toBe('builtin')
    expect(getThemeOrigin('test-only-meta')).toBe('cc')
  })

  test('meta defaults to origin cc when not passed', async () => {
    const { getThemeOrigin } = await import('../meta.js')
    registerThemeWithTraits('test-only-defaulted', getTheme('dark'), 'light')
    registered.push('test-only-defaulted')
    expect(getThemeOrigin('test-only-defaulted')).toBe('cc')
    const { getThemeMeta } = await import('../meta.js')
    expect(getThemeMeta('test-only-defaulted')?.mode).toBe('light')
  })
})
