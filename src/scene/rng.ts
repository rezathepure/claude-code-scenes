/**
 * Deterministic RNG for scene models.
 *
 * Scenes are tested by asserting exact cell output over many ticks, which
 * needs a seedable generator; Math.random can't be seeded. At runtime the
 * controller seeds from the clock — determinism only matters under test.
 */

export type Rng = () => number

/** mulberry32 — tiny, fast, good enough for confetti physics. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
