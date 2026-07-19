import { afterEach, describe, expect, test } from 'bun:test'
import {
  getRegisteredThemeNames,
  getTheme,
  isKnownTheme,
  isReservedThemeName,
  registerTheme,
  THEME_NAMES,
  type Theme,
  unregisterTheme,
  validateThemeSetting,
} from '../theme-types'

// The registry is module-global, so anything registered here would leak into
// every other test file in the process (bun's mock.module and module state are
// process-wide). Track and undo.
const registered: string[] = []
function register(name: string, theme: Theme): void {
  registered.push(name)
  registerTheme(name, theme)
}
afterEach(() => {
  while (registered.length > 0) {
    unregisterTheme(registered.pop()!)
  }
})

function fakeTheme(marker: string): Theme {
  // Every slot the same value; only identity matters for these tests.
  return new Proxy({} as Theme, { get: () => marker }) as Theme
}

describe('getTheme', () => {
  test('resolves every built-in name to a distinct palette', () => {
    const seen = new Set<string>()
    for (const name of THEME_NAMES) {
      const theme = getTheme(name)
      expect(theme).toBeDefined()
      expect(typeof theme.text).toBe('string')
      seen.add(theme.text + theme.background)
    }
    // Six built-ins should not collapse onto one palette — that would mean the
    // registry lost entries and everything silently fell back to dark.
    expect(seen.size).toBeGreaterThan(1)
  })

  test('falls back to dark for an unknown name rather than throwing', () => {
    expect(getTheme('no-such-theme')).toBe(getTheme('dark'))
  })

  test('accepts an arbitrary runtime string (the type is genuinely widened)', () => {
    const name: string = 'generated-at-runtime'
    expect(() => getTheme(name)).not.toThrow()
  })
})

describe('isKnownTheme', () => {
  test('distinguishes present from fallen-back', () => {
    expect(isKnownTheme('dark')).toBe(true)
    expect(isKnownTheme('no-such-theme')).toBe(false)
  })
})

describe('registerTheme', () => {
  test('makes a new theme resolvable and listed', () => {
    expect(isKnownTheme('sakura')).toBe(false)
    register('sakura', fakeTheme('petal'))

    expect(isKnownTheme('sakura')).toBe(true)
    expect(getTheme('sakura').text).toBe('petal')
    expect(getRegisteredThemeNames()).toContain('sakura')
  })

  test('refuses to shadow a built-in', () => {
    // `dark` is the fallback every unresolvable name lands on. Letting a user
    // file replace it would take the escape hatch down with it.
    expect(() => registerTheme('dark', fakeTheme('overridden'))).toThrow(
      /reserved/,
    )
    expect(getTheme('dark').text).not.toBe('overridden')
  })

  test('refuses every built-in name, not just dark', () => {
    for (const builtin of THEME_NAMES) {
      expect(() => registerTheme(builtin, fakeTheme('x'))).toThrow(/reserved/)
    }
  })
})

describe('isReservedThemeName', () => {
  test('covers exactly the shipped themes', () => {
    for (const builtin of THEME_NAMES) {
      expect(isReservedThemeName(builtin)).toBe(true)
    }
    expect(isReservedThemeName('matrix')).toBe(false)
    expect(isReservedThemeName('sakura')).toBe(false)
  })
})

describe('unregisterTheme', () => {
  test('removes a runtime theme entirely, so it falls back', () => {
    registerTheme('matrix', fakeTheme('rain'))
    unregisterTheme('matrix')

    expect(isKnownTheme('matrix')).toBe(false)
    expect(getTheme('matrix')).toBe(getTheme('dark'))
  })

  test('will not remove a built-in, keeping the fallback resolvable', () => {
    unregisterTheme('dark')

    expect(isKnownTheme('dark')).toBe(true)
    expect(typeof getTheme('dark').text).toBe('string')
  })
})

describe('getRegisteredThemeNames', () => {
  test('includes all built-ins', () => {
    const names = getRegisteredThemeNames()
    for (const builtin of THEME_NAMES) {
      expect(names).toContain(builtin)
    }
  })
})

describe('validateThemeSetting', () => {
  test('passes a built-in through untouched and stays silent', () => {
    let called = false
    expect(validateThemeSetting('light', () => (called = true))).toBe('light')
    expect(called).toBe(false)
  })

  test("passes 'auto' through without consulting the registry", () => {
    // 'auto' is resolved against the system theme later, so it is never a
    // registry key and must not be reported as missing.
    let called = false
    expect(validateThemeSetting('auto', () => (called = true))).toBe('auto')
    expect(called).toBe(false)
  })

  test('reports an unknown name and returns the fallback', () => {
    const seen: Array<[string, string]> = []
    const result = validateThemeSetting('theme-that-was-deleted', (n, f) =>
      seen.push([n, f]),
    )

    expect(result).toBe('dark')
    expect(seen).toEqual([['theme-that-was-deleted', 'dark']])
  })

  test('reports a given name only once', () => {
    let count = 0
    const name = 'repeatedly-missing-theme'
    validateThemeSetting(name, () => count++)
    validateThemeSetting(name, () => count++)
    validateThemeSetting(name, () => count++)

    // Config is read on every render path; warning each time would flood.
    expect(count).toBe(1)
  })

  test('accepts a name once it has been registered', () => {
    const name = 'late-registered-theme'
    expect(validateThemeSetting(name, () => {})).toBe('dark')

    register(name, fakeTheme('x'))
    expect(validateThemeSetting(name, () => {})).toBe(name)
  })
})
