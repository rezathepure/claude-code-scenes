/**
 * Test helper: puts the starter themes into the registry without touching a
 * filesystem.
 *
 * In the app they get there by a different route — `seedStarterThemes` writes
 * them into ~/.claude/cct and `loadUserThemes` reads them back — but these
 * tests are asserting things about the themes themselves (that they load
 * warning-free, that their palettes are complete, that they can be deleted),
 * not about how they reach disk. Driving the real seed path would mean a temp
 * HOME and a config stub in four files, to prove nothing the seed tests do
 * not already prove.
 *
 * This deliberately mirrors what the loader does with a theme file, so a
 * change to that path shows up here rather than being silently bypassed.
 */

import { loadThemeFromText } from '../loader.js'
import { registerThemeWithTraits } from '../register.js'
import type { ThemeWarning } from '../schema.js'
import { STARTER_THEMES } from '../bundled/index.js'

/** Registers every starter theme. Returns warnings, which should be empty. */
export function registerStarterThemesForTest(): ThemeWarning[] {
  const warnings: ThemeWarning[] = []

  for (const [name, data] of STARTER_THEMES) {
    const result = loadThemeFromText(name, JSON.stringify(data))
    warnings.push(...result.warnings)

    if (result.theme) {
      registerThemeWithTraits(
        name,
        result.theme.theme,
        result.theme.mode,
        result.theme.scene,
        { origin: 'cc', description: result.theme.description },
      )
    }
  }

  return warnings
}
