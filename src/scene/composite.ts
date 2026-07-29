/**
 * Merges several layer models into the one SceneModel ScenePass consumes.
 *
 * Two constraints from the pass shape everything here.
 *
 * First, `cells()` must return the SAME ARRAY between ticks — React renders
 * between ticker ticks have to repaint an identical frame. So the array is
 * built once and refilled in place; a compositor that concatenated per call
 * would fail models.test.ts's identity assertion and make the scene flicker
 * under typing.
 *
 * Second, the pass truncates by PREFIX at ~600 cells and knows nothing about
 * layers. Array order is therefore both z-order and priority: a dense field
 * emitted first would starve a sprite of the entire budget. Parts are sorted
 * by priority once, sprites reserve their slice before anything else divides
 * the remainder, and each part contributes at most its share.
 *
 * Occlusion between layers is free, incidentally: the pass only paints into
 * virgin cells, and a scene cell painted by an earlier layer is no longer
 * virgin. Front-to-back array order is all the z-buffer there is.
 */

import { type SceneModel, sceneCellBudget } from '@anthropic/ink'
import type { SceneGlyph } from '@anthropic/ink'

export type CompositePart = {
  model: SceneModel
  /** Share of the leftover budget, relative to the other unreserved parts. */
  weight: number
  /** Reserved parts take their natural size first — sprites, not textures. */
  reserved: boolean
  /** Lower paints first, and therefore wins the cell. */
  priority: number
}

/**
 * Reserved parts never take more than this fraction of the frame. A sprite
 * with `count: 4` is still only a quarter of the picture.
 */
const RESERVED_FRACTION = 0.25

/**
 * The array is filled beyond the pass's budget on purpose. The pass skips
 * out-of-bounds and occluded glyphs WITHOUT spending budget, so a layer whose
 * cells mostly land under the conversation would otherwise consume its whole
 * share painting nothing and starve everything after it. Overdrawing gives
 * the tail somewhere to come from; the pass still stops at its own cap.
 */
const OVERDRAW = 2
const OVERDRAW_CEILING = 1200

export function createCompositeModel(
  parts: readonly CompositePart[],
): SceneModel {
  const ordered = [...parts].sort((a, b) => a.priority - b.priority)
  const shares = new Array<number>(ordered.length).fill(0)
  const cells: SceneGlyph[] = []

  function rebuild(): void {
    // Truncate rather than reassign: the array identity is the contract.
    cells.length = 0
    for (let i = 0; i < ordered.length; i++) {
      const src = ordered[i]!.model.cells()
      const take = Math.min(src.length, shares[i]!)
      for (let j = 0; j < take; j++) cells.push(src[j]!)
    }
  }

  return {
    resize(w: number, h: number): void {
      for (const part of ordered) part.model.resize(w, h)

      const total = Math.min(OVERDRAW_CEILING, sceneCellBudget(w, h) * OVERDRAW)
      const reservedCap = Math.max(1, Math.floor(total * RESERVED_FRACTION))

      let reservedUsed = 0
      for (let i = 0; i < ordered.length; i++) {
        if (!ordered[i]!.reserved) continue
        const want = ordered[i]!.model.cells().length
        const give = Math.max(0, Math.min(want, reservedCap - reservedUsed))
        shares[i] = give
        reservedUsed += give
      }

      const rest = Math.max(0, total - reservedUsed)
      let weightSum = 0
      for (const part of ordered) if (!part.reserved) weightSum += part.weight

      for (let i = 0; i < ordered.length; i++) {
        if (ordered[i]!.reserved) continue
        shares[i] =
          weightSum > 0
            ? Math.max(1, Math.round((rest * ordered[i]!.weight) / weightSum))
            : 0
      }

      rebuild()
    },

    tick(): void {
      for (const part of ordered) part.model.tick()
      rebuild()
    },

    cells(): ReadonlyArray<SceneGlyph> {
      return cells
    },
  }
}
