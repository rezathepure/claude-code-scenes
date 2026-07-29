/**
 * Derives scene colours from the theme palette.
 *
 * Scenes add no colour slots to the theme format. A layer names a slot the
 * palette already has and the ramp is computed from it — a hue walked down in
 * Oklab lightness, or a blend toward that slot's shimmer partner — so a
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

/**
 * `intensity` (0–1] is the scene's opacity knob: colours are faded toward
 * black by scaling their Oklab components, which is exactly alpha-over-black
 * — the terminal background the ramp constants were designed against. At 1
 * the output is untouched.
 */
export function deriveRainStyles(
  theme: Record<string, string>,
  ink: SceneStyleInterner,
  intensity = 1,
): { head: number; ramp: number[] } {
  return deriveRampStyles(theme, ink, 'claude', intensity)
}

/**
 * A ramp walked down in Oklab lightness from any palette slot — the rain
 * derivation, generalised so a layer can key off `error` or `suggestion`
 * instead of always the primary accent.
 */
function deriveRampStyles(
  theme: Record<string, string>,
  ink: SceneStyleInterner,
  slot: string,
  intensity = 1,
): { head: number; ramp: number[] } {
  const accent = parseColor(theme[slot] ?? '') ?? FALLBACK_ACCENT
  const { c, h } = rgbToOklch(accent)
  const chroma = Math.min(c, 0.25) * intensity

  const ramp: number[] = []
  for (let i = 0; i < RAIN_RAMP_STEPS; i++) {
    const l =
      RAMP_L_TOP - ((RAMP_L_TOP - RAMP_L_BOTTOM) * i) / (RAIN_RAMP_STEPS - 1)
    ramp.push(
      ink.internSceneStyle(fmt(oklchToRgb({ l: l * intensity, c: chroma, h }))),
    )
  }

  // Head: the theme's hue, pushed almost to white — reads as the glint.
  const head = ink.internSceneStyle(
    fmt(oklchToRgb({ l: HEAD_L * intensity, c: chroma * 0.35, h })),
  )
  return { head, ramp }
}

/** Same `intensity` semantics as deriveRainStyles. */
export function derivePetalStyles(
  theme: Record<string, string>,
  ink: SceneStyleInterner,
  intensity = 1,
): { tints: number[] } {
  return { tints: deriveTintStyles(theme, ink, 'claude', intensity) }
}

/**
 * Four tints lerped from a slot toward its shimmer partner — the petal
 * derivation, generalised. A slot without a `<slot>Shimmer` sibling blends
 * toward a lightened version of itself, so every slot in SCENE_COLOR_SLOTS
 * yields four distinct tints rather than four copies of one.
 */
function deriveTintStyles(
  theme: Record<string, string>,
  ink: SceneStyleInterner,
  slot: string,
  intensity = 1,
): number[] {
  const base = parseColor(theme[slot] ?? '') ?? FALLBACK_ACCENT
  const partner =
    parseColor(theme[`${slot}Shimmer`] ?? '') ??
    lighten(base) ??
    FALLBACK_SHIMMER
  const a = rgbToOklab(base)
  const b = rgbToOklab(partner)

  const tints: number[] = []
  for (const t of [0, 1 / 3, 2 / 3, 1]) {
    tints.push(
      ink.internSceneStyle(
        fmt(
          oklabToRgb({
            l: (a.l + (b.l - a.l) * t) * intensity,
            a: (a.a + (b.a - a.a) * t) * intensity,
            b: (a.b + (b.b - a.b) * t) * intensity,
          }),
        ),
      ),
    )
  }
  return tints
}

/** A visibly lighter version of a colour, for slots with no shimmer sibling. */
function lighten(c: Rgb): Rgb {
  const { l, a, b } = rgbToOklab(c)
  return oklabToRgb({ l: Math.min(1, l + 0.28), a: a * 0.7, b: b * 0.7 })
}

/**
 * Exactly one interned style for a slot at a given opacity.
 *
 * Sprites want a flat colour, not a ramp — and interning seven styles for a
 * three-row spider would spend the process-wide style budget on nothing.
 */
export function deriveSolidStyle(
  theme: Record<string, string>,
  ink: SceneStyleInterner,
  slot: string,
  intensity: number,
): number {
  const base = rgbToOklab(parseColor(theme[slot] ?? '') ?? FALLBACK_ACCENT)
  return ink.internSceneStyle(
    fmt(
      oklabToRgb({
        l: base.l * intensity,
        a: base.a * intensity,
        b: base.b * intensity,
      }),
    ),
  )
}

/**
 * The styles one field layer paints with.
 *
 * `flat` gives each particle a fixed tint for life (petals); everything else
 * wants a ramp it can index by trail depth or by its own clock.
 */
export function deriveFieldStyles(
  theme: Record<string, string>,
  ink: SceneStyleInterner,
  slot: string,
  fade: string,
  intensity: number,
): { head: number; ramp: number[] } {
  if (fade === 'flat') {
    const tints = deriveTintStyles(theme, ink, slot, intensity)
    return { head: tints[0] ?? 0, ramp: tints }
  }
  return deriveRampStyles(theme, ink, slot, intensity)
}
