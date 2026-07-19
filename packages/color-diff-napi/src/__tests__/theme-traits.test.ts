import { afterEach, describe, expect, test } from 'bun:test'
import {
  ColorFile,
  registerThemeTraits,
  type ThemeTraits,
  unregisterThemeTraits,
} from '../index'

// The traits map is module-global; undo anything these tests register.
const registered: string[] = []
function register(name: string, traits: ThemeTraits): void {
  registered.push(name)
  registerThemeTraits(name, traits)
}
afterEach(() => {
  while (registered.length > 0) {
    unregisterThemeTraits(registered.pop()!)
  }
})

/**
 * Renders a snippet and returns the raw ANSI, which encodes the syntax palette
 * that was chosen. Comparing two renders tells us whether two theme names
 * resolved to the same palette without asserting on specific colour values.
 */
function renderWith(themeName: string): string {
  const out = new ColorFile('const x = 1\n', 'x.ts').render(
    themeName,
    80,
    false,
  )
  return (out ?? []).join('\n')
}

describe('built-in themes (unchanged behaviour)', () => {
  test('the shipped names still classify by their own spelling', () => {
    // The six built-ins encode their traits in their names, so the heuristic
    // is correct for them and must keep working with nothing registered.
    expect(renderWith('dark')).not.toBe(renderWith('light'))
    expect(renderWith('dark-ansi')).not.toBe(renderWith('dark'))
  })
})

describe('runtime themes', () => {
  test('an unregistered name is mis-classified as light (the old bug)', () => {
    // Documents *why* registerThemeTraits is required: the name contains
    // neither 'dark' nor 'light', so the heuristic calls it light.
    //
    // Uses a test-only name rather than a real theme: `matrix` and `sakura`
    // are registered by src/themes tests running in the same process, and
    // this assertion depends on the name being *un*registered.
    expect(renderWith('test-only-vampire')).toBe(renderWith('light'))
  })

  test('registering traits gives a dark theme the dark syntax palette', () => {
    register('test-only-vampire', {
      dark: true,
      ansi: false,
      daltonized: false,
    })

    expect(renderWith('test-only-vampire')).toBe(renderWith('dark'))
    expect(renderWith('test-only-vampire')).not.toBe(renderWith('light'))
  })

  test('registered traits also drive the ansi palette', () => {
    register('sakura-ansi-ish', { dark: true, ansi: true, daltonized: false })

    expect(renderWith('sakura-ansi-ish')).toBe(renderWith('dark-ansi'))
  })

  test('daltonized is honoured independently of the name', () => {
    register('accessible-plum', { dark: true, ansi: false, daltonized: true })

    expect(renderWith('accessible-plum')).toBe(renderWith('dark-daltonized'))
  })

  test('unregistering restores heuristic classification', () => {
    registerThemeTraits('test-only-vampire', {
      dark: true,
      ansi: false,
      daltonized: false,
    })
    expect(renderWith('test-only-vampire')).toBe(renderWith('dark'))

    unregisterThemeTraits('test-only-vampire')
    expect(renderWith('test-only-vampire')).toBe(renderWith('light'))
  })
})
