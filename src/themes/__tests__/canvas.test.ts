/**
 * The blank canvas the create flow renders on.
 *
 * Two properties matter, and neither is obvious from the return value alone:
 * the canvas must carry NO scene (an animation behind "design your own theme"
 * is the bug this exists to fix), and it must keep the user's light/dark mode
 * (we never paint a background, so the wrong mode is unreadable text on the
 * terminal's own colour).
 */

import { afterEach, describe, expect, test } from 'bun:test'
import { getSceneConfig } from '../../scene/registry.js'
import { getTheme } from '../../utils/theme.js'
import { registerBundledThemes } from '../bundled/index.js'
import { canvasThemeFor } from '../canvas.js'
import {
  registerThemeWithTraits,
  unregisterThemeWithTraits,
} from '../register.js'

registerBundledThemes()

const registered: string[] = []
afterEach(() => {
  while (registered.length > 0) {
    unregisterThemeWithTraits(registered.pop()!)
  }
})

function register(name: string, mode: 'dark' | 'light'): void {
  registerThemeWithTraits(name, getTheme('dark'), mode, undefined, {
    origin: 'cc',
  })
  registered.push(name)
}

describe('canvasThemeFor', () => {
  test('keeps a built-in verbatim, including the accessible variants', () => {
    // Someone on dark-daltonized or dark-ansi chose that; the design screen is
    // where they have to read and type, so it is the last place to override it.
    for (const name of [
      'dark',
      'light',
      'dark-daltonized',
      'light-daltonized',
      'dark-ansi',
      'light-ansi',
    ]) {
      expect(canvasThemeFor(name)).toBe(name)
    }
  })

  test('keeps auto, which follows the terminal and so already matches it', () => {
    expect(canvasThemeFor('auto')).toBe('auto')
  })

  test('drops a custom theme to the built-in of the same mode', () => {
    register('test-only-canvas-dark', 'dark')
    register('test-only-canvas-light', 'light')
    expect(canvasThemeFor('test-only-canvas-dark')).toBe('dark')
    expect(canvasThemeFor('test-only-canvas-light')).toBe('light')
  })

  test('falls back to dark for a name nothing knows about', () => {
    // getTheme falls back to dark for an unregistered name, so the canvas
    // agrees with what would actually be rendered.
    expect(canvasThemeFor('test-only-canvas-nonexistent')).toBe('dark')
  })

  test('never lands on a theme that animates', () => {
    // The whole point: entering "Create your own" from matrix must not leave
    // its rain falling behind the invitation to design a theme.
    for (const from of ['matrix', 'sakura', 'voltage', 'dark', 'auto']) {
      const canvas = canvasThemeFor(from)
      expect({ from, kind: getSceneConfig(canvas).kind }).toEqual({
        from,
        kind: 'none',
      })
    }
  })
})
