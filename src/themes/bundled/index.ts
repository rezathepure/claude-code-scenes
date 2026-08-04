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
 *
 * Note the two lists below. Shipping a file and installing a theme are
 * separate decisions: WORKED_EXAMPLES ship so the generator and the tests can
 * read them, but are never seeded and never appear in `/theme`.
 */

import matrix from './matrix.json'
import parchment from './parchment.json'
import sakura from './sakura.json'
import voltage from './voltage.json'
import winter from './winter.json'

/**
 * The three that are installed. Seeded to disk on first run, listed in
 * `/theme`, and deletable from there.
 *
 * Kept deliberately short. Every starter is a theme the user has to scroll
 * past forever to reach their own, so the bar is "worth having by default",
 * not "worth having existed".
 */
export const STARTER_THEMES: ReadonlyArray<readonly [string, unknown]> = [
  ['matrix', matrix],
  ['sakura', sakura],
  // Designed through `/theme create` rather than written by hand, and the only
  // starter with a sprite — proof the generation flow produces themes good
  // enough to ship, not just good enough to preview.
  ['winter', winter],
]

/**
 * Theme files that ship in the repo but are NEVER installed: they are not
 * seeded, not registered, and never appear in `/theme`.
 *
 * They are here because two other things read them, and deleting the files
 * would quietly degrade both:
 *
 *  - `generate/prompt.ts` quotes voltage verbatim as its composed-scene
 *    example — two field layers and a shader, which is the shape the model is
 *    being asked to produce. Without it the prompt would teach multi-layer
 *    scenes using only the two legacy presets, which are the thing the
 *    grammar exists to move past.
 *  - parchment is the only light-mode theme file, and the light path differs
 *    in substance: a different built-in to inherit slots from and a different
 *    background to validate contrast against. It is the fixture that keeps
 *    that path under test.
 *
 * Anything added here must earn its place the same way — a consumer that
 * would otherwise lose coverage. This is not a graveyard for retired starters.
 */
export const WORKED_EXAMPLES: ReadonlyArray<readonly [string, unknown]> = [
  ['parchment', parchment],
  ['voltage', voltage],
]

/** Names of the starter themes, for tests and for `/theme` grouping. */
export function getBundledThemeNames(): string[] {
  return STARTER_THEMES.map(([name]) => name)
}
