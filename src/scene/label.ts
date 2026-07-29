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

/**
 * What the scene is made of, in prose, one line per layer type.
 *
 * The animation preview is a small box, and a sparse scene can genuinely put
 * two or three characters in it — sakura peaks at five cells in a 70×10 panel.
 * Watching that tells you nothing about what you would change. This does, and
 * it is legible at any size, so it carries the backdrop view when the box
 * cannot.
 *
 * Deliberately names the vocabulary the model uses — motions, catalogs, colour
 * slots — because those are the words that work in a refinement.
 */
export function describeScene(config: SceneConfig | undefined): string[] {
  if (config === undefined || config.kind === 'none') return []
  if (config.kind === 'rain') {
    return [
      `rain · katakana falling in claude, ${config.params.density} per column`,
    ]
  }
  if (config.kind === 'petals') {
    return [
      `petals · drifting in claude, ${config.params.density} per 1000 cells`,
    ]
  }

  const { fields, sprites, shaders } = config.scene
  const lines: string[] = []
  if (fields.length > 0) {
    lines.push(
      `${count(fields.length, 'field')} · ${fields
        .map(f => `${f.motion} (${f.glyphs}, ${f.color})`)
        .join(' · ')}`,
    )
  }
  if (sprites.length > 0) {
    lines.push(
      `${count(sprites.length, 'sprite')} · ${sprites
        .map(s => `${s.path} (${s.frames.frames.length} frames, ${s.color})`)
        .join(' · ')}`,
    )
  }
  if (shaders.length > 0) {
    lines.push(
      `${count(shaders.length, 'shader')} · ${shaders
        .map(s => `${s.glyphs} in ${s.color}`)
        .join(' · ')}`,
    )
  }
  return lines
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

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
