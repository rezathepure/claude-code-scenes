/**
 * The single place a theme becomes available.
 *
 * A theme lives in **two** registries that know nothing about each other:
 *
 *  - the palette, in @anthropic/ink, which decides what colour everything is;
 *  - its traits, in color-diff-napi, which decide which *syntax* palette diffs
 *    and code blocks use.
 *
 * Registering only the first is a silent, visible bug: color-diff falls back
 * to reading the traits out of the theme's *name*, and since a name like
 * "moody-vampire-castle" contains neither "dark" nor "light" it is classified
 * as light and handed the GitHub light syntax palette. The theme then renders
 * correctly everywhere except diffs, which come out with pale pink and green
 * line fills on a dark background.
 *
 * Everything that registers a theme goes through here so the two cannot drift.
 * The lower-level registerTheme/registerThemeTraits still exist, but nothing
 * outside this module should call them.
 */

import { registerThemeTraits, unregisterThemeTraits } from 'color-diff-napi'
import { isTerminalPaletteColor } from '../utils/color.js'
import { registerTheme, type Theme, unregisterTheme } from '../utils/theme.js'

export type ThemeMode = 'dark' | 'light'

/**
 * Whether a palette is built from terminal ANSI indices rather than fixed RGB.
 *
 * Decided from `text` as a representative sample: an ANSI theme uses
 * `ansi:<name>` throughout, and mixing the two is not something a coherent
 * theme does. Matters because ANSI themes need the ANSI syntax palette, whose
 * colours the terminal owns.
 */
function detectAnsiPalette(theme: Theme): boolean {
  const text = (theme as unknown as Record<string, string>).text
  return typeof text === 'string' && isTerminalPaletteColor(text)
}

/**
 * Makes a theme available for rendering, including its syntax highlighting.
 *
 * @param mode Which terminal background the theme was designed for. This is
 *   authoritative — it comes from the theme file, not from guessing at the name.
 */
export function registerThemeWithTraits(
  name: string,
  theme: Theme,
  mode: ThemeMode,
): void {
  registerTheme(name, theme)
  registerThemeTraits(name, {
    dark: mode === 'dark',
    ansi: detectAnsiPalette(theme),
    // Only the shipped *-daltonized themes are colour-vision adjusted, and
    // those are built-ins that never come through here.
    daltonized: false,
  })
}

/** Removes a theme from both registries. */
export function unregisterThemeWithTraits(name: string): void {
  unregisterTheme(name)
  unregisterThemeTraits(name)
}
