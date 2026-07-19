/**
 * Canonical colour parsing for theme values.
 *
 * Theme colours are written in four notations, all of which the renderer
 * understands (see packages/@ant/ink/src/core/colorize.ts):
 *
 *   rgb(r,g,b)     truecolour
 *   #rgb / #rrggbb hex
 *   ansi256(n)     xterm 256-colour palette index
 *   ansi:<name>    one of the 16 named ANSI colours
 *
 * Anything else renders as *uncoloured text, silently* — ink's
 * theme/color.ts sniffs those four prefixes and falls through to a theme-key
 * lookup that yields `undefined` for an unrecognised value. That silent
 * failure is the main thing user-authored themes need protecting from, which
 * is what this module exists for.
 *
 * IMPORTANT: the grammar here deliberately mirrors colorize.ts exactly,
 * including its tolerance of at most one space after each comma. A looser
 * parser would accept values the renderer then refuses to colour — precisely
 * the failure this is meant to catch.
 */

export type Rgb = { r: number; g: number; b: number }

// Mirrors RGB_REGEX / ANSI_REGEX in packages/@ant/ink/src/core/colorize.ts.
// `\s?` (not `\s*`) is intentional — see the note above.
const RGB_REGEX = /^rgb\(\s?(\d+),\s?(\d+),\s?(\d+)\s?\)$/
const ANSI256_REGEX = /^ansi256\(\s?(\d+)\s?\)$/
const HEX_SHORT_REGEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i
const HEX_FULL_REGEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i

/**
 * The 16 named ANSI colours, in the order chalk exposes them.
 *
 * These RGB values are the common xterm defaults and are only ever
 * approximations: every terminal lets the user redefine its own palette, so
 * what actually appears on screen is outside our control. Use
 * `isTerminalPaletteColor` to skip contrast checks on these rather than
 * validating against numbers that may not reflect reality.
 */
// Ordered so the array index *is* the palette index for 0..15, which is how
// ansi256ToRgb resolves the low range.
const ANSI_NAMED_ORDERED: ReadonlyArray<readonly [string, Rgb]> = [
  ['black', { r: 0, g: 0, b: 0 }],
  ['red', { r: 205, g: 0, b: 0 }],
  ['green', { r: 0, g: 205, b: 0 }],
  ['yellow', { r: 205, g: 205, b: 0 }],
  ['blue', { r: 0, g: 0, b: 238 }],
  ['magenta', { r: 205, g: 0, b: 205 }],
  ['cyan', { r: 0, g: 205, b: 205 }],
  ['white', { r: 229, g: 229, b: 229 }],
  ['blackBright', { r: 127, g: 127, b: 127 }],
  ['redBright', { r: 255, g: 0, b: 0 }],
  ['greenBright', { r: 0, g: 255, b: 0 }],
  ['yellowBright', { r: 255, g: 255, b: 0 }],
  ['blueBright', { r: 92, g: 92, b: 255 }],
  ['magentaBright', { r: 255, g: 0, b: 255 }],
  ['cyanBright', { r: 0, g: 255, b: 255 }],
  ['whiteBright', { r: 255, g: 255, b: 255 }],
]

const ANSI_NAMED: Readonly<Record<string, Rgb>> =
  Object.fromEntries(ANSI_NAMED_ORDERED)

// Level values for the 6x6x6 colour cube occupying indices 16..231.
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const

/** Converts an xterm 256-palette index to its conventional RGB value. */
function ansi256ToRgb(index: number): Rgb | null {
  if (!Number.isInteger(index) || index < 0 || index > 255) {
    return null
  }
  if (index < 16) {
    return ANSI_NAMED_ORDERED[index]?.[1] ?? null
  }
  if (index < 232) {
    const i = index - 16
    return {
      r: CUBE_LEVELS[Math.floor(i / 36)]!,
      g: CUBE_LEVELS[Math.floor(i / 6) % 6]!,
      b: CUBE_LEVELS[i % 6]!,
    }
  }
  // 232..255 is the 24-step greyscale ramp.
  const level = 8 + (index - 232) * 10
  return { r: level, g: level, b: level }
}

/**
 * Parses a theme colour value into RGB, or returns null if the renderer would
 * not colour it.
 *
 * For `ansi:` and `ansi256()` values the result is the conventional palette
 * approximation, not what the user's terminal will actually draw.
 */
export function parseColor(input: string): Rgb | null {
  if (typeof input !== 'string') {
    return null
  }

  if (input.startsWith('ansi:')) {
    return ANSI_NAMED[input.slice('ansi:'.length)] ?? null
  }

  if (input.startsWith('ansi256')) {
    const m = ANSI256_REGEX.exec(input)
    return m ? ansi256ToRgb(Number.parseInt(m[1]!, 10)) : null
  }

  if (input.startsWith('#')) {
    const short = HEX_SHORT_REGEX.exec(input)
    if (short) {
      // #abc expands to #aabbcc
      return {
        r: Number.parseInt(short[1]! + short[1]!, 16),
        g: Number.parseInt(short[2]! + short[2]!, 16),
        b: Number.parseInt(short[3]! + short[3]!, 16),
      }
    }
    const full = HEX_FULL_REGEX.exec(input)
    return full
      ? {
          r: Number.parseInt(full[1]!, 16),
          g: Number.parseInt(full[2]!, 16),
          b: Number.parseInt(full[3]!, 16),
        }
      : null
  }

  const rgb = RGB_REGEX.exec(input)
  if (!rgb) {
    return null
  }
  const r = Number.parseInt(rgb[1]!, 10)
  const g = Number.parseInt(rgb[2]!, 10)
  const b = Number.parseInt(rgb[3]!, 10)
  // The renderer hands these straight to chalk.rgb, which clamps out-of-range
  // channels rather than failing. Reject them here so a theme with rgb(300,0,0)
  // is reported to its author instead of quietly rendering as pure red.
  if (r > 255 || g > 255 || b > 255) {
    return null
  }
  return { r, g, b }
}

/**
 * True for values whose final appearance is chosen by the terminal, not by us
 * (`ansi:<name>` and `ansi256(n)`).
 *
 * Contrast checks are meaningless for these: the user's terminal palette can
 * map index 1 to anything at all, so a computed ratio would be fiction. The
 * built-in `*-ansi` themes are made entirely of these values.
 */
export function isTerminalPaletteColor(input: string): boolean {
  return input.startsWith('ansi:') || input.startsWith('ansi256')
}
