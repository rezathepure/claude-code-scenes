/**
 * What to call a scene in the UI.
 *
 * A composed scene has no single `kind` to print — "rain" was both the
 * primitive's name and its label, and that coincidence ends here. The model
 * names its own animation ("neon drizzle", "web-swing"), which is both better
 * copy than any derivation and the sort of thing models are good at.
 *
 * Legacy configs return 'rain' and 'petals', so every tile that exists today
 * looks exactly as it does today.
 */

import type { SceneConfig } from './types.js'

/** The scene's display name, or null when the theme does not animate. */
export function sceneLabelOf(config: SceneConfig | undefined): string | null {
  if (config === undefined) return null
  switch (config.kind) {
    case 'none':
      return null
    case 'rain':
      return 'rain'
    case 'petals':
      return 'petals'
    case 'custom': {
      const { label, fields, sprites, shaders } = config.scene
      if (label !== '') return label
      // No label: say what it is made of, most distinctive part first.
      if (sprites.length > 0) return 'sprite'
      if (fields.length > 0) return fields[0]?.motion ?? 'scene'
      if (shaders.length > 0) return 'shader'
      return null
    }
  }
}
