/**
 * The two shipped animations, expressed in the grammar.
 *
 * `{"scene": {"kind": "rain"}}` stays valid forever — it is shorthand, and
 * this is what it is shorthand FOR. Writing the presets as ordinary field
 * layers is what makes "rain and petals are not special cases" a fact the
 * compiler checks rather than a claim in a comment: if the grammar could not
 * express them, this file would not typecheck, and if it expressed them
 * differently, golden.test.ts would fail.
 *
 * The density conversion is the one thing worth reading twice. Rain counts
 * drops per column; petals counted per 1000 screen cells. The grammar has one
 * `density` knob, so area verbs divide by 100 and the petals preset scales by
 * a tenth — which reproduces the old count at every screen size, not just the
 * one it was tuned at.
 */

import type { FieldLayer, PetalsParams, RainParams } from './types.js'

/** Values a layer must carry but these two motions do not use. */
const INERT = {
  color: 'claude',
  priority: 5,
  weight: 3,
  angle: 0,
} as const

export function rainPreset(p: RainParams): FieldLayer {
  return {
    ...INERT,
    motion: 'fall',
    glyphs: 'katakana',
    fade: 'trail',
    intensity: p.intensity,
    density: p.density,
    speedMin: p.speedMin,
    speedMax: p.speedMax,
    trailMin: p.trailMin,
    trailMax: p.trailMax,
    mutateRate: p.mutateRate,
    swayAmp: 0,
    swayPeriod: 90,
    tumblePeriod: 0,
  }
}

export function petalsPreset(p: PetalsParams): FieldLayer {
  return {
    ...INERT,
    motion: 'drift',
    glyphs: 'petals',
    fade: 'flat',
    intensity: p.intensity,
    // Per 1000 cells → per 100 cells, the area verbs' unit.
    density: p.density / 10,
    speedMin: p.fallMin,
    speedMax: p.fallMax,
    swayAmp: p.swayAmp,
    swayPeriod: p.swayPeriod,
    tumblePeriod: p.tumblePeriod,
    trailMin: 1,
    trailMax: 1,
    mutateRate: 0,
  }
}
