/**
 * Paints an expression.
 *
 * The layer samples a grid, asks the compiled expression for a brightness at
 * each cell, and draws the ones above the threshold with a glyph and a style
 * chosen from a SMALL FIXED SET.
 *
 * That last part is not a style choice, it is the safety property. StylePool
 * ids are packed into 15 bits and never evicted, so a shader that interned a
 * colour per computed value would exhaust the space in minutes and then start
 * corrupting the styles of real UI text. This model is handed an array of
 * already-interned ids and has no access to the interner at all — there is no
 * code path from a number it computes to a new style.
 */

import type { SceneGlyph, SceneModel } from '@anthropic/ink'
import type { Evaluator } from './expr/index.js'
import { SLOT_COUNT } from './expr/index.js'
import { glyphCatalog } from './glyphs.js'
import type { ShaderLayer } from './types.js'

/**
 * Cap on expression evaluations per tick.
 *
 * The scene controller drops the whole animation when a tick averages over
 * 12ms, and it does so silently. A full-screen 200x50 sample is 10,000
 * evaluations; capping and widening the stride keeps a busy shader from
 * taking the rest of the scene down with it.
 */
const MAX_SAMPLES = 4000

export function createShaderModel(
  layer: ShaderLayer,
  evaluate: Evaluator,
  styles: readonly number[],
): SceneModel {
  const chars = glyphCatalog(layer.glyphs) ?? glyphCatalog('blocks') ?? '·'
  const env = new Float64Array(SLOT_COUNT)
  const levels = Math.max(1, Math.min(styles.length, layer.levels))
  const span = Math.max(1e-6, 1 - layer.threshold)

  let width = 0
  let height = 0
  let stride = Math.max(1, layer.step)
  let t = 0
  let cache: SceneGlyph[] = []

  function rebuild(): void {
    const next: SceneGlyph[] = []
    env[4] = t
    env[5] = width
    env[6] = height

    let i = 0
    for (let y = 0; y < height; y += stride) {
      for (let x = 0; x < width; x += stride) {
        env[0] = x
        env[1] = y
        env[2] = width > 1 ? x / (width - 1) : 0
        env[3] = height > 1 ? y / (height - 1) : 0
        env[7] = i++

        const raw = evaluate(env)
        // One guard, at the boundary. A NaN cell is simply an unlit cell.
        const alpha = Number.isFinite(raw) ? raw : 0
        if (alpha < layer.threshold) continue

        const step = Math.min(
          levels - 1,
          (((alpha - layer.threshold) / span) * levels) | 0,
        )
        next.push({
          x,
          y,
          char: chars[Math.min(chars.length - 1, step)] ?? chars[0] ?? '·',
          styleId: styles[step] ?? styles[0] ?? 0,
        })
      }
    }
    cache = next
  }

  return {
    resize(w: number, h: number): void {
      width = Math.max(1, w)
      height = Math.max(1, h)
      // Widen the stride until the grid fits the evaluation budget.
      stride = Math.max(1, layer.step)
      while ((width / stride) * (height / stride) > MAX_SAMPLES) stride++
      rebuild()
    },
    tick(): void {
      // Wrapped so double precision stays meaningful over a long session; a
      // single predictable discontinuity every ~28 hours of animation.
      t = (t + 1) % 1_000_000
      rebuild()
    },
    cells(): ReadonlyArray<SceneGlyph> {
      return cache
    },
  }
}
