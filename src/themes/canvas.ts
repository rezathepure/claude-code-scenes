/**
 * The palette the "Create your own" flow renders in.
 *
 * The picker previews whatever tile you are on — that is the whole point of
 * it — except on the create tile, where there is no theme to preview yet. It
 * fell back to the theme you are currently using, so the invitation to design
 * a theme was drawn under sakura's falling petals or matrix's rain. That reads
 * as though the thing you are about to describe already exists.
 *
 * So the create flow gets a canvas instead: a built-in palette, no scene,
 * nothing to mistake for the thing you are about to make. The generated theme
 * then lands on top of it, and the change is unmissable.
 *
 * Which built-in is not a free choice:
 *
 *  - The mode has to match. We never paint a background, so the terminal's own
 *    stays put — a dark palette on a light terminal is grey text on white.
 *  - A built-in already in use is kept verbatim. Someone on `dark-daltonized`
 *    or `dark-ansi` chose that for a reason, and the design screen is the one
 *    place in this flow they have to actually read and type. Those palettes
 *    carry no scene either, so they are already canvases.
 */

import { isReservedThemeName, type ThemeSetting } from '../utils/theme.js'
import { getThemeMeta } from './meta.js'

/** The neutral built-in to render the create flow in, given the active theme. */
export function canvasThemeFor(setting: ThemeSetting): ThemeSetting {
  // 'auto' resolves to a built-in and follows the terminal — already neutral,
  // and already the closest match to the user's background.
  if (setting === 'auto' || isReservedThemeName(setting)) return setting
  // Unregistered names fall back to `dark` in getTheme, so the canvas agrees
  // with what would actually be rendered.
  return getThemeMeta(setting)?.mode === 'light' ? 'light' : 'dark'
}
