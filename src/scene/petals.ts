/**
 * Sakura petals: a drift of blossoms falling slowly with a sine sway, each
 * tumbling through the four glyph phases ❀ → ✿ → ⁕ → · on its own clock.
 *
 * Pure model, seeded-RNG-deterministic like rain.ts.
 */

import type { SceneGlyph, SceneModel } from '@anthropic/ink'
import type { Rng } from './rng.js'
import { PETAL_GLYPHS, type PetalsParams } from './types.js'

export type PetalStyles = {
  /** Tint styles; each petal keeps one for life. */
  tints: number[]
}

type Petal = {
  /** Sway centerline. */
  x0: number
  y: number
  fall: number
  amp: number
  phase: number
  tint: number
  /** Age in ticks; drives sway and tumble. */
  t: number
}

export function createPetalsModel(
  params: PetalsParams,
  styles: PetalStyles,
  rng: Rng,
): SceneModel {
  let width = 0
  let height = 0
  let petals: Petal[] = []
  let cache: SceneGlyph[] = []

  function spawn(startAnywhere: boolean): Petal {
    return {
      x0: rng() * width,
      y: startAnywhere ? rng() * height : -rng() * 4 - 1,
      fall: params.fallMin + rng() * (params.fallMax - params.fallMin),
      amp: params.swayAmp * (0.6 + rng() * 0.4),
      phase: rng() * Math.PI * 2,
      tint: (rng() * styles.tints.length) | 0,
      t: (rng() * params.swayPeriod) | 0,
    }
  }

  function rebuildCache(): void {
    const next: SceneGlyph[] = []
    for (const petal of petals) {
      const y = Math.floor(petal.y)
      if (y < 0 || y >= height) continue
      const x = Math.round(
        petal.x0 +
          petal.amp *
            Math.sin((2 * Math.PI * petal.t) / params.swayPeriod + petal.phase),
      )
      if (x < 0 || x >= width) continue
      const glyphPhase =
        ((petal.t / (params.tumblePeriod / PETAL_GLYPHS.length)) | 0) %
        PETAL_GLYPHS.length
      next.push({
        x,
        y,
        char: PETAL_GLYPHS[glyphPhase] ?? '·',
        styleId: styles.tints[petal.tint] ?? styles.tints[0] ?? 0,
      })
    }
    cache = next
  }

  return {
    resize(w: number, h: number): void {
      width = Math.max(1, w)
      height = Math.max(1, h)
      const target = Math.max(
        1,
        Math.round((params.density * width * height) / 1000),
      )
      petals = []
      for (let i = 0; i < target; i++) petals.push(spawn(true))
      rebuildCache()
    },

    tick(): void {
      for (const petal of petals) {
        petal.y += petal.fall
        petal.t++
        if (petal.y > height) {
          Object.assign(petal, spawn(false))
        }
      }
      rebuildCache()
    },

    cells(): ReadonlyArray<SceneGlyph> {
      return cache
    },
  }
}
