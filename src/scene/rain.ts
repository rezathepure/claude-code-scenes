/**
 * Matrix rain: columns of katakana falling at different speeds, bright head,
 * trail fading through the theme-derived ramp, occasional glyph mutation.
 *
 * Pure model — knows nothing about screens or styles beyond the styleIds it
 * is given. All randomness comes through the injected Rng so tests can seed.
 */

import type { SceneGlyph, SceneModel } from '@anthropic/ink'
import type { Rng } from './rng.js'
import { RAIN_GLYPHS, type RainParams } from './types.js'

export type RainStyles = {
  /** Bright head-of-drop style. */
  head: number
  /** Trail styles, brightest first; indexed by depth into the trail. */
  ramp: number[]
}

type Drop = {
  col: number
  /** Head position, fractional; the drop occupies floor(headY)..-trail. */
  headY: number
  speed: number
  trail: number
  /** Glyph per trail cell, index 0 = head. */
  glyphs: string[]
}

export function createRainModel(
  params: RainParams,
  styles: RainStyles,
  rng: Rng,
): SceneModel {
  let width = 0
  let height = 0
  let drops: Drop[] = []
  let cache: SceneGlyph[] = []

  const randomGlyph = (): string =>
    RAIN_GLYPHS[(rng() * RAIN_GLYPHS.length) | 0] ?? 'ｱ'

  function spawn(startAnywhere: boolean): Drop {
    const trail =
      (params.trailMin + rng() * (params.trailMax - params.trailMin)) | 0 || 2
    const glyphs: string[] = []
    for (let i = 0; i < trail; i++) glyphs.push(randomGlyph())
    return {
      col: (rng() * width) | 0,
      // On resize, distribute over the whole screen so the first frame is
      // already raining; respawns start above the top and fall in.
      headY: startAnywhere ? rng() * (height + trail) - trail : -rng() * trail,
      speed: params.speedMin + rng() * (params.speedMax - params.speedMin),
      trail,
      glyphs,
    }
  }

  function rebuildCache(): void {
    const next: SceneGlyph[] = []
    for (const drop of drops) {
      const head = Math.floor(drop.headY)
      for (let i = 0; i < drop.trail; i++) {
        const y = head - i
        if (y < 0 || y >= height) continue
        const styleId =
          i === 0
            ? styles.head
            : (styles.ramp[
                Math.min(
                  styles.ramp.length - 1,
                  ((i / drop.trail) * styles.ramp.length) | 0,
                )
              ] ?? styles.head)
        next.push({ x: drop.col, y, char: drop.glyphs[i] ?? 'ｱ', styleId })
      }
    }
    cache = next
  }

  return {
    resize(w: number, h: number): void {
      width = Math.max(1, w)
      height = Math.max(1, h)
      const target = Math.max(1, Math.round(params.density * width))
      drops = []
      for (let i = 0; i < target; i++) drops.push(spawn(true))
      rebuildCache()
    },

    tick(): void {
      for (const drop of drops) {
        const before = Math.floor(drop.headY)
        drop.headY += drop.speed
        // Head advanced N whole cells → N fresh glyphs enter at the head.
        for (let step = Math.floor(drop.headY) - before; step > 0; step--) {
          drop.glyphs.pop()
          drop.glyphs.unshift(randomGlyph())
        }
        // Sparse mutation keeps the wall shimmering like the film.
        if (params.mutateRate > 0) {
          for (let i = 0; i < drop.glyphs.length; i++) {
            if (rng() < params.mutateRate) drop.glyphs[i] = randomGlyph()
          }
        }
        // Fully below the screen → respawn above the top.
        if (drop.headY - drop.trail > height) {
          Object.assign(drop, spawn(false))
        }
      }
      rebuildCache()
    },

    cells(): ReadonlyArray<SceneGlyph> {
      return cache
    },
  }
}
