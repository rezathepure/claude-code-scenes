/**
 * Colour maths for theme validation and repair.
 *
 * Two separate colour models are used here, on purpose:
 *
 *  - **WCAG relative luminance** for contrast ratios. This is a legally
 *    specified formula; it is not perceptually uniform and is not meant to be.
 *    Its only job is answering "can this text be read".
 *
 *  - **Oklab / OKLCH** for *changing* colours. When a theme fails a contrast
 *    check we adjust its lightness until it passes, and the whole promise of
 *    the feature is that this preserves the author's intent. Doing that in HSL
 *    visibly shifts hue — lightening a saturated red drifts it toward pink —
 *    whereas Oklab was built so that moving along L leaves perceived hue
 *    alone. A moody theme stays moody.
 *
 * Oklab also gives perceptual distance for free (Euclidean distance in Oklab
 * is a good ΔE), which is what tells us whether a theme's error and warning
 * colours are actually distinguishable.
 *
 * Oklab transform constants are from Björn Ottosson's reference definition.
 */

import type { Rgb } from './color.js'

export type Oklch = {
  /** Perceptual lightness, 0 (black) to 1 (white). */
  l: number
  /** Chroma — roughly saturation. 0 is grey; ~0.4 is as vivid as sRGB gets. */
  c: number
  /** Hue angle in degrees, 0-360. Meaningless when c is 0. */
  h: number
}

/** Undoes the sRGB transfer function, giving light-linear intensity. */
function srgbToLinear(channel: number): number {
  const v = channel / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** Reapplies the sRGB transfer function. Input and output are 0..1. */
function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
  return Math.min(255, Math.max(0, Math.round(c * 255)))
}

/**
 * WCAG 2.x relative luminance.
 *
 * Note this is *not* the BT.709 shortcut used in src/utils/systemTheme.ts for
 * terminal dark/light detection: that one skips the gamma decode, which is
 * fine for a coarse "is the background dark" test but wrong for contrast.
 */
export function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * srgbToLinear(color.r) +
    0.7152 * srgbToLinear(color.g) +
    0.0722 * srgbToLinear(color.b)
  )
}

/**
 * WCAG contrast ratio between two colours, from 1 (identical) to 21
 * (black on white). Order-independent.
 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

export function rgbToOklab(color: Rgb): { l: number; a: number; b: number } {
  const r = srgbToLinear(color.r)
  const g = srgbToLinear(color.g)
  const b = srgbToLinear(color.b)

  const lCone = Math.cbrt(
    0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
  )
  const mCone = Math.cbrt(
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
  )
  const sCone = Math.cbrt(
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b,
  )

  return {
    l: 0.2104542553 * lCone + 0.793617785 * mCone - 0.0040720468 * sCone,
    a: 1.9779984951 * lCone - 2.428592205 * mCone + 0.4505937099 * sCone,
    b: 0.0259040371 * lCone + 0.7827717662 * mCone - 0.808675766 * sCone,
  }
}

export function oklabToRgb(lab: { l: number; a: number; b: number }): Rgb {
  const lCone = (lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b) ** 3
  const mCone = (lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b) ** 3
  const sCone = (lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b) ** 3

  return {
    r: linearToSrgb(
      4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone,
    ),
    g: linearToSrgb(
      -1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone,
    ),
    b: linearToSrgb(
      -0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone,
    ),
  }
}

export function rgbToOklch(color: Rgb): Oklch {
  const { l, a, b } = rgbToOklab(color)
  const c = Math.sqrt(a * a + b * b)
  // atan2 returns -180..180; normalise so hue is always a positive angle.
  const h = c < 1e-7 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
  return { l, c, h }
}

export function oklchToRgb(color: Oklch): Rgb {
  const rad = (color.h * Math.PI) / 180
  return oklabToRgb({
    l: color.l,
    a: color.c * Math.cos(rad),
    b: color.c * Math.sin(rad),
  })
}

/**
 * Perceptual distance between two colours (Euclidean in Oklab).
 *
 * Rough intuition: below ~0.02 reads as the same colour, ~0.05 is a noticeable
 * difference, above ~0.1 is unmistakable. Used to check that semantically
 * distinct slots — error vs warning vs success — are actually tellable apart,
 * which contrast ratio alone will not catch: two colours can both contrast
 * beautifully against the background and still be identical to each other.
 */
export function perceptualDistance(a: Rgb, b: Rgb): number {
  const la = rgbToOklab(a)
  const lb = rgbToOklab(b)
  return Math.hypot(la.l - lb.l, la.a - lb.a, la.b - lb.b)
}

/** Largest lightness change repairContrast will make before giving up. */
const REPAIR_SEARCH_STEPS = 24

/**
 * Nudges `fg` along the lightness axis until it meets `minRatio` against `bg`,
 * keeping its hue and chroma.
 *
 * Returns `fg` untouched when it already passes — the common case, and the
 * reason a loose floor leaves hand-designed themes completely alone.
 *
 * The direction is chosen by whichever end of the lightness axis actually has
 * more headroom against this background, rather than assuming "dark background
 * means lighten": a mid-grey background is better served by pushing text away
 * from it in whichever direction is further.
 *
 * If even the extreme cannot reach `minRatio` (a mid-tone background has a
 * hard ceiling — nothing contrasts strongly with 50% grey), the best result
 * found is returned rather than an exception. Callers that need to know should
 * re-check with `contrastRatio`.
 */
export function repairContrast(fg: Rgb, bg: Rgb, minRatio: number): Rgb {
  if (contrastRatio(fg, bg) >= minRatio) {
    return fg
  }

  const start = rgbToOklch(fg)
  // Which extreme gives more contrast against this background?
  const towardWhite =
    contrastRatio(oklchToRgb({ ...start, l: 1 }), bg) >
    contrastRatio(oklchToRgb({ ...start, l: 0 }), bg)
  const target = towardWhite ? 1 : 0

  // Binary search for the smallest move that clears the bar, so the colour
  // changes as little as it can get away with.
  let lo = start.l
  let hi = target
  let best = oklchToRgb({ ...start, l: target })

  if (contrastRatio(best, bg) < minRatio) {
    return best // Even the extreme falls short; nothing better is available.
  }

  for (let i = 0; i < REPAIR_SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2
    const candidate = oklchToRgb({ ...start, l: mid })
    if (contrastRatio(candidate, bg) >= minRatio) {
      best = candidate
      hi = mid
    } else {
      lo = mid
    }
  }

  return best
}
