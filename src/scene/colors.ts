/**
 * Derives scene colours from the theme palette.
 *
 * Scenes add no colour slots to the theme format. A rain ramp is computed
 * from the theme's own `claude` accent (its hue, walked down in Oklab
 * lightness), petal tints are blends of `claude` and `claudeShimmer` — so a
 * generated crimson theme gets crimson rain with zero extra configuration,
 * and the "one theme = one idea" discipline survives the animation.
 *
 * Oklab (src/utils/colorMath.ts) is used for the same reason validation uses
 * it: moving lightness leaves perceived hue alone, so the ramp stays the
 * theme's colour instead of drifting muddy.
 */

import { parseColor, type Rgb } from '../utils/color.js'
import {
  oklabToRgb,
  oklchToRgb,
  rgbToOklab,
  rgbToOklch,
} from '../utils/colorMath.js'

/** The slice of Ink the derivation needs — kept narrow for tests. */
export type SceneStyleInterner = {
  internSceneStyle(color: string): number
}

const RAIN_RAMP_STEPS = 6
/** Head stays near-white-of-the-hue; trail walks down to a murmur. */
const RAMP_L_TOP = 0.72
const RAMP_L_BOTTOM = 0.34
const HEAD_L = 0.92

function fmt(c: Rgb): string {
  return `rgb(${c.r},${c.g},${c.b})`
}

/** Fallbacks if a palette value is unparseable (should not happen post-validation). */
const FALLBACK_ACCENT: Rgb = { r: 0, g: 255, b: 65 }
const FALLBACK_SHIMMER: Rgb = { r: 150, g: 255, b: 180 }

export function deriveRainStyles(
  theme: Record<string, string>,
  ink: SceneStyleInterner,
): { head: number; ramp: number[] } {
  const accent = parseColor(theme.claude ?? '') ?? FALLBACK_ACCENT
  const { c, h } = rgbToOklch(accent)
  const chroma = Math.min(c, 0.25)

  const ramp: number[] = []
  for (let i = 0; i < RAIN_RAMP_STEPS; i++) {
    const l =
      RAMP_L_TOP - ((RAMP_L_TOP - RAMP_L_BOTTOM) * i) / (RAIN_RAMP_STEPS - 1)
    ramp.push(ink.internSceneStyle(fmt(oklchToRgb({ l, c: chroma, h }))))
  }

  // Head: the theme's hue, pushed almost to white — reads as the glint.
  const head = ink.internSceneStyle(
    fmt(oklchToRgb({ l: HEAD_L, c: chroma * 0.35, h })),
  )
  return { head, ramp }
}

export function derivePetalStyles(
  theme: Record<string, string>,
  ink: SceneStyleInterner,
): { tints: number[] } {
  const a = rgbToOklab(parseColor(theme.claude ?? '') ?? FALLBACK_ACCENT)
  const b = rgbToOklab(
    parseColor(theme.claudeShimmer ?? '') ?? FALLBACK_SHIMMER,
  )

  const tints: number[] = []
  for (const t of [0, 1 / 3, 2 / 3, 1]) {
    tints.push(
      ink.internSceneStyle(
        fmt(
          oklabToRgb({
            l: a.l + (b.l - a.l) * t,
            a: a.a + (b.a - a.a) * t,
            b: a.b + (b.b - a.b) * t,
          }),
        ),
      ),
    )
  }
  return { tints }
}
