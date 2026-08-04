/**
 * The starter themes: real theme files that ship inside the package.
 *
 * Shipping them is only how they get onto the machine. They are not loaded
 * from here — `seedStarterThemes` writes them into ~/.claude/cct on first run
 * and `loadUserThemes` picks them up from disk like anything the user wrote,
 * so a starter theme is editable, hot-reloadable and deletable as a file
 * rather than being a privileged category baked into the binary.
 *
 * They stay ordinary JSON for two other reasons. They are the worked examples
 * the theme *generator* has to match, so if the pipeline cannot carry them it
 * cannot carry a generated theme either — `generate/prompt.ts` quotes several
 * verbatim, which is why they must remain importable from here. And any
 * warning raised while loading one is a bug in the pipeline or in the file;
 * the tests assert there are none.
 */

import matrix from './matrix.json'
import parchment from './parchment.json'
import sakura from './sakura.json'
import voltage from './voltage.json'
import winter from './winter.json'

export const STARTER_THEMES: ReadonlyArray<readonly [string, unknown]> = [
  ['matrix', matrix],
  ['sakura', sakura],
  // Designed through `/theme create` rather than written by hand, and the only
  // starter with a sprite — proof the generation flow produces themes good
  // enough to ship, not just good enough to preview.
  ['winter', winter],
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

/** Names of the starter themes, for tests and for `/theme` grouping. */
export function getBundledThemeNames(): string[] {
  return STARTER_THEMES.map(([name]) => name)
}
