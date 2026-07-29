/**
 * Themes that ship with the binary but are not built-ins.
 *
 * They are deliberately real JSON files, loaded through exactly the same path
 * as anything a user drops in ~/.claude/themes — parsed, slot-filled from the
 * mode's built-in, contrast-validated. Nothing here is special-cased.
 *
 * That is the point: Matrix and Sakura are the worked examples the theme
 * *generator* has to match, so if the pipeline cannot carry them it cannot
 * carry a generated theme either. Any warning raised while loading these is a
 * bug in the pipeline or in the file, and the tests assert there are none.
 *
 * They are also the best documentation of the file format, and users can copy
 * one out as a starting point.
 */

import { getGlobalConfig } from '../../utils/config.js'
import { logForDebugging } from '../../utils/debug.js'
import { loadThemeFromText } from '../loader.js'
import type { ThemeWarning } from '../schema.js'
import matrix from './matrix.json'
import parchment from './parchment.json'
import sakura from './sakura.json'
import voltage from './voltage.json'
import { registerThemeWithTraits } from '../register.js'

const BUNDLED: ReadonlyArray<readonly [string, unknown]> = [
  ['matrix', matrix],
  ['sakura', sakura],
  // The light-mode worked example. Without one, the light path — a different
  // built-in to inherit from and a different background to validate against —
  // would ship with no theme exercising it.
  ['parchment', parchment],
  // The composed-scene worked example: two field layers and a shader, which
  // is what the generator is being asked to produce. Without it the only
  // shipped scenes would be the two legacy presets, and the prompt would be
  // teaching from examples of the thing it is trying to move past.
  ['voltage', voltage],
]

/**
 * Registers the bundled themes so they appear in `/theme`.
 *
 * Returns any warnings, which should always be empty — surfaced rather than
 * swallowed so a regression in the loader shows up instead of silently
 * degrading the shipped themes.
 */
export function registerBundledThemes(): ThemeWarning[] {
  const warnings: ThemeWarning[] = []

  // Deleting a bundled theme cannot remove a file, so it is recorded in
  // config instead; honouring it here is what makes the deletion stick.
  //
  // Guarded because registration must never fail over a preference: init
  // calls enableConfigs() first so this read is fine there, but a caller that
  // registers themes earlier would otherwise take down the whole registry and
  // leave the app with no palettes at all.
  let hidden = new Set<string>()
  try {
    hidden = new Set(getGlobalConfig().hiddenThemes ?? [])
  } catch {
    // Config not readable yet — ship everything.
  }

  for (const [name, data] of BUNDLED) {
    if (hidden.has(name)) continue
    // Round-tripping through text keeps this on the single load path rather
    // than adding a second, subtly different one for bundled themes.
    const result = loadThemeFromText(name, JSON.stringify(data))
    warnings.push(...result.warnings)

    if (result.theme) {
      registerThemeWithTraits(
        name,
        result.theme.theme,
        result.theme.mode,
        result.theme.scene,
        { origin: 'bundled', description: result.theme.description },
      )
    }
  }

  if (warnings.length > 0) {
    logForDebugging(
      `[themes] Bundled themes produced ${warnings.length} warning(s); this indicates a bug`,
      { level: 'warn' },
    )
  }

  return warnings
}

/** Names of the bundled themes, for tests and for `/theme` grouping. */
export function getBundledThemeNames(): string[] {
  return BUNDLED.map(([name]) => name)
}
