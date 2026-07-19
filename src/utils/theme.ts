import chalk, { Chalk } from 'chalk'
import { env } from './env.js'

// The palette, the Theme type and getTheme() live in the ink package
// (packages/@ant/ink/src/theme/theme-types.ts), which is the lower-level
// dependency — src imports ink, never the reverse. This module used to hold a
// byte-identical 639-line copy of all of it; the two drifted apart only in how
// they detected Apple Terminal. Everything is re-exported here so the ~57
// existing `utils/theme.js` import sites keep working unchanged.
//
// The import is deliberately the `@anthropic/ink/theme-types` subpath rather
// than the package root: theme-types only pulls in chalk, whereas the root
// entry drags in React and react-reconciler. Several consumers of this module
// (ConfigTool/supportedSettings.ts, hooks/useCopyOnSelect.ts) import values,
// not just types, so a root import would put the whole ink framework on their
// runtime path.
export type {
  BuiltinThemeName,
  Theme,
  ThemeName,
  ThemeSetting,
} from '@anthropic/ink/theme-types'
export {
  getRegisteredThemeNames,
  getTheme,
  isKnownTheme,
  registerTheme,
  THEME_NAMES,
  THEME_SETTINGS,
  unregisterTheme,
  validateThemeSetting,
} from '@anthropic/ink/theme-types'

// Create a chalk instance with 256-color level for Apple Terminal
// Apple Terminal doesn't handle 24-bit color escape sequences well
//
// Kept local rather than re-exported: this is the one place the two former
// copies genuinely differed. The ink copy uses `process.env.TERM_PROGRAM`
// directly (it cannot import from src/), while this one uses env.terminal,
// which runs a fuller detection chain before falling back to TERM_PROGRAM.
const chalkForChart =
  env.terminal === 'Apple_Terminal'
    ? new Chalk({ level: 2 }) // 256 colors
    : chalk

/**
 * Converts a theme color to an ANSI escape sequence for use with asciichart.
 * Uses chalk to generate the escape codes, with 256-color mode for Apple Terminal.
 */
export function themeColorToAnsi(themeColor: string): string {
  const rgbMatch = themeColor.match(/rgb\(\s?(\d+),\s?(\d+),\s?(\d+)\s?\)/)
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]!, 10)
    const g = parseInt(rgbMatch[2]!, 10)
    const b = parseInt(rgbMatch[3]!, 10)
    // Use chalk.rgb which auto-converts to 256 colors when level is 2
    // Extract just the opening escape sequence by using a marker
    const colored = chalkForChart.rgb(r, g, b)('X')
    return colored.slice(0, colored.indexOf('X'))
  }
  // Fallback to magenta if parsing fails
  return '\x1b[35m'
}
