/**
 * Plays drawn art along a path.
 *
 * This is the layer that makes a scene about something. A field can look like
 * weather; only a sprite can be a spider on a thread, and the renderer never
 * learns which — it receives frames of characters and a path name, and plays
 * them. Everything specific to the idea lives in the theme file.
 *
 * A space in a frame is transparent, not a blank cell. That single rule is
 * what gives a sprite a silhouette instead of a rectangle, and it matters
 * more to how the thing reads than any amount of motion.
 *
 * Sprites paint first (priority 0 by default), so a field glyph landing on
 * the spider's body is simply skipped by the pass — occlusion for free, no
 * z-buffer.
 */

import type { SceneGlyph, SceneModel } from '@anthropic/ink'
import { pathAt, pathHasTrail } from './paths.js'
import type { Rng } from './rng.js'
import type { SpriteLayer } from './types.js'

export type SpriteStyles = {
  /** The art itself. */
  body: number
  /** The line left along the path already travelled. */
  trail: number
}

export function createSpriteModel(
  layer: SpriteLayer,
  styles: SpriteStyles,
  rng: Rng,
): SceneModel {
  const { frames, width: sw, height: sh } = layer.frames
  const count = Math.max(1, layer.count)

  // Instances are spread along the path by a fixed offset rather than a
  // random one, so `count: 3` reads as a procession rather than a clump —
  // but the rng still nudges each so two themes with the same sprite do not
  // march in lockstep.
  const offsets: number[] = []
  for (let i = 0; i < count; i++) {
    offsets.push(
      Math.round(
        (layer.pathPeriod * i) / count + rng() * layer.pathPeriod * 0.1,
      ),
    )
  }

  let width = 0
  let height = 0
  let t = 0
  let cache: SceneGlyph[] = []

  function rebuild(): void {
    const next: SceneGlyph[] = []
    const frame = frames[Math.floor(t / layer.framePeriod) % frames.length]
    if (frame === undefined) {
      cache = next
      return
    }

    for (const offset of offsets) {
      const at = pathAt(layer.path, {
        t: t + offset,
        period: layer.pathPeriod,
        w: width,
        h: height,
        sw,
        sh,
        x: layer.x,
        y: layer.y,
        span: layer.span,
      })
      const ox = Math.round(at.x)
      const oy = Math.round(at.y)

      // Body first: the trail is scenery, and if the budget truncates it is
      // the scenery that should go.
      for (let r = 0; r < frame.length; r++) {
        const row = frame[r]!
        for (let c = 0; c < row.length; c++) {
          const ch = row[c]!
          if (ch === ' ') continue // transparent, not blank
          const x = ox + c
          const y = oy + r
          if (x < 0 || x >= width || y < 0 || y >= height) continue
          next.push({ x, y, char: ch, styleId: styles.body })
        }
      }

      if (layer.trailChar !== '' && pathHasTrail(layer.path)) {
        // The path already travelled, which for `descend` is exactly the silk
        // a spider hangs from.
        const anchorY = Math.round(layer.y * (height - sh))
        const from = Math.min(anchorY, oy)
        const to = Math.max(anchorY, oy)
        const x = ox + (sw >> 1)
        for (let y = from; y < to; y++) {
          if (x < 0 || x >= width || y < 0 || y >= height) continue
          next.push({ x, y, char: layer.trailChar, styleId: styles.trail })
        }
      }
    }
    cache = next
  }

  return {
    resize(w: number, h: number): void {
      width = Math.max(1, w)
      height = Math.max(1, h)
      rebuild()
    },
    tick(): void {
      t++
      rebuild()
    },
    cells(): ReadonlyArray<SceneGlyph> {
      return cache
    },
  }
}
