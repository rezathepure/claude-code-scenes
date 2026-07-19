import { describe, expect, test } from 'bun:test'
import type { Rgb } from '../color'
import {
  contrastRatio,
  oklchToRgb,
  perceptualDistance,
  relativeLuminance,
  repairContrast,
  rgbToOklch,
} from '../colorMath'

const BLACK: Rgb = { r: 0, g: 0, b: 0 }
const WHITE: Rgb = { r: 255, g: 255, b: 255 }

// The two reference themes' grounds and body text, used to prove the repair
// floor leaves hand-designed themes alone.
const MATRIX_BASE: Rgb = { r: 0, g: 8, b: 3 }
const MATRIX_FG: Rgb = { r: 200, g: 245, b: 205 }
const MATRIX_MUTED: Rgb = { r: 92, g: 150, b: 108 }
const SAKURA_BASE: Rgb = { r: 22, g: 10, b: 24 }
const SAKURA_FG: Rgb = { r: 250, g: 236, b: 244 }
const SAKURA_MUTED: Rgb = { r: 178, g: 142, b: 168 }

describe('relativeLuminance', () => {
  test('anchors at the WCAG endpoints', () => {
    expect(relativeLuminance(BLACK)).toBeCloseTo(0, 6)
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 6)
  })

  test('applies the sRGB gamma decode', () => {
    // Mid-grey is ~0.216 with the decode and ~0.502 without it. This is the
    // check that distinguishes a real WCAG luminance from the BT.709 shortcut
    // used for terminal dark/light detection.
    expect(relativeLuminance({ r: 128, g: 128, b: 128 })).toBeCloseTo(0.2158, 3)
  })

  test('weights green most heavily', () => {
    const g = relativeLuminance({ r: 0, g: 255, b: 0 })
    const r = relativeLuminance({ r: 255, g: 0, b: 0 })
    const b = relativeLuminance({ r: 0, g: 0, b: 255 })
    expect(g).toBeGreaterThan(r)
    expect(r).toBeGreaterThan(b)
  })
})

describe('contrastRatio', () => {
  test('black on white is the 21:1 maximum', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 4)
  })

  test('a colour against itself is 1:1', () => {
    expect(contrastRatio(MATRIX_FG, MATRIX_FG)).toBeCloseTo(1, 6)
  })

  test('is order-independent', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(
      contrastRatio(WHITE, BLACK),
      6,
    )
  })
})

describe('rgbToOklch / oklchToRgb', () => {
  test('round-trips sRGB values', () => {
    for (const c of [
      MATRIX_FG,
      SAKURA_FG,
      MATRIX_MUTED,
      { r: 255, g: 92, b: 105 },
    ]) {
      const back = oklchToRgb(rgbToOklch(c))
      expect(back.r).toBeCloseTo(c.r, 0)
      expect(back.g).toBeCloseTo(c.g, 0)
      expect(back.b).toBeCloseTo(c.b, 0)
    }
  })

  test('greys have no meaningful chroma', () => {
    expect(rgbToOklch({ r: 128, g: 128, b: 128 }).c).toBeLessThan(0.001)
  })

  test('lightness is ordered', () => {
    expect(rgbToOklch(BLACK).l).toBeLessThan(rgbToOklch(MATRIX_MUTED).l)
    expect(rgbToOklch(MATRIX_MUTED).l).toBeLessThan(rgbToOklch(WHITE).l)
  })
})

describe('perceptualDistance', () => {
  test('is zero for identical colours', () => {
    expect(perceptualDistance(MATRIX_FG, MATRIX_FG)).toBe(0)
  })

  test('separates the reference themes error and warning colours', () => {
    // Sakura: TERRA rose-red vs AMBER apricot. These must be tellable apart or
    // a failed command reads like a warning.
    const terra: Rgb = { r: 255, g: 92, b: 105 }
    const amber: Rgb = { r: 245, g: 168, b: 118 }
    expect(perceptualDistance(terra, amber)).toBeGreaterThan(0.05)
  })

  test('catches colours that contrast well but not with each other', () => {
    // Both are perfectly readable on black, yet nearly identical to one
    // another — exactly the case contrast ratio alone cannot detect.
    const a: Rgb = { r: 255, g: 90, b: 70 }
    const b: Rgb = { r: 253, g: 94, b: 74 }
    expect(contrastRatio(a, BLACK)).toBeGreaterThan(4)
    expect(contrastRatio(b, BLACK)).toBeGreaterThan(4)
    expect(perceptualDistance(a, b)).toBeLessThan(0.02)
  })
})

describe('repairContrast', () => {
  test('returns the colour untouched when it already passes', () => {
    const result = repairContrast(MATRIX_FG, MATRIX_BASE, 3)
    expect(result).toBe(MATRIX_FG) // identity, not just equality
  })

  test('lightens text that is too dark for its background', () => {
    const tooDark: Rgb = { r: 40, g: 18, b: 18 }
    const bg: Rgb = { r: 26, g: 8, b: 8 }
    expect(contrastRatio(tooDark, bg)).toBeLessThan(3)

    const fixed = repairContrast(tooDark, bg, 3)
    expect(contrastRatio(fixed, bg)).toBeGreaterThanOrEqual(2.99)
  })

  test('darkens text that is too light for its background', () => {
    const tooLight: Rgb = { r: 230, g: 225, b: 220 }
    const bg: Rgb = { r: 250, g: 248, b: 245 }

    const fixed = repairContrast(tooLight, bg, 3)
    expect(contrastRatio(fixed, bg)).toBeGreaterThanOrEqual(2.99)
    expect(rgbToOklch(fixed).l).toBeLessThan(rgbToOklch(tooLight).l)
  })

  test('preserves hue while repairing — the mood survives', () => {
    // This is the property that justifies Oklab over HSL. A deep vampire red
    // must still be red after being made readable, not drift toward pink.
    const moodyRed: Rgb = { r: 74, g: 32, b: 32 }
    const bg: Rgb = { r: 26, g: 8, b: 8 }

    const before = rgbToOklch(moodyRed)
    const after = rgbToOklch(repairContrast(moodyRed, bg, 3))

    expect(Math.abs(after.h - before.h)).toBeLessThan(3) // degrees
    expect(after.l).toBeGreaterThan(before.l) // it did actually move
  })

  test('changes the colour as little as it can get away with', () => {
    const dim: Rgb = { r: 60, g: 40, b: 40 }
    const bg: Rgb = { r: 20, g: 10, b: 10 }

    const loose = repairContrast(dim, bg, 3)
    const strict = repairContrast(dim, bg, 7)

    // A stricter floor should push further, never less.
    expect(rgbToOklch(strict).l).toBeGreaterThan(rgbToOklch(loose).l)
  })

  test('returns the best available when the target is unreachable', () => {
    // Nothing contrasts 21:1 with mid-grey; must degrade, not throw or loop.
    const midGrey: Rgb = { r: 128, g: 128, b: 128 }
    const result = repairContrast({ r: 120, g: 120, b: 120 }, midGrey, 21)
    expect(result).toBeDefined()
    expect(contrastRatio(result, midGrey)).toBeGreaterThan(1)
  })
})

describe('the reference themes pass a loose floor untouched', () => {
  // The calibration test from the plan: Matrix and Sakura are hand-designed
  // and read well, so a correctly-set "barely picky" floor must not modify
  // them. If this fails, the floor is too strict and is about to flatten
  // exactly the moody themes the feature exists to allow.
  const LOOSE_FLOOR = 3

  const cases: Array<[string, Rgb, Rgb]> = [
    ['matrix text', MATRIX_FG, MATRIX_BASE],
    ['matrix muted', MATRIX_MUTED, MATRIX_BASE],
    ['sakura text', SAKURA_FG, SAKURA_BASE],
    ['sakura muted', SAKURA_MUTED, SAKURA_BASE],
  ]

  for (const [label, fg, bg] of cases) {
    test(`${label} needs no repair`, () => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(LOOSE_FLOOR)
      expect(repairContrast(fg, bg, LOOSE_FLOOR)).toBe(fg)
    })
  }
})
