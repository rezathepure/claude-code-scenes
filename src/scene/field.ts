/**
 * The generic particle field — one model, seven motions.
 *
 * This replaces rain.ts and petals.ts. `fall` IS the old rain and `drift` IS
 * the old petals, down to the order they draw from the RNG, which is why
 * golden.test.ts can still assert the exact frames matrix and sakura have
 * always produced. That equivalence is the whole argument for the grammar:
 * the two shipped animations are not special cases beside it, they are two
 * points inside it.
 *
 * Each verb supplies four small strategies — how many particles, how to spawn
 * one, how to advance it, how to draw it — over shared machinery for sizing,
 * respawning and caching. Particles are one struct with every field rather
 * than a union, because a monomorphic shape is both simpler and faster than
 * asking the engine to juggle seven hidden classes.
 *
 * All randomness comes through the injected Rng so tests can seed.
 */

import type { SceneGlyph, SceneModel } from '@anthropic/ink'
import { glyphCatalog } from './glyphs.js'
import type { Rng } from './rng.js'
import type { FieldLayer } from './types.js'

/** Styles a layer draws with: a head accent plus a ramp, brightest first. */
export type FieldStyles = {
  head: number
  ramp: number[]
}

type Particle = {
  /** Column, or the centreline a swaying particle oscillates about. */
  x: number
  y: number
  vx: number
  vy: number
  amp: number
  phase: number
  /** Index into the ramp, for verbs that fix a tint at spawn. */
  tint: number
  /** Age in ticks. */
  age: number
  /** Trail length in cells, for verbs that leave one. */
  trail: number
  /** Glyph per trail cell, index 0 = head. Empty for single-cell verbs. */
  glyphs: string[]
}

function blank(): Particle {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    amp: 0,
    phase: 0,
    tint: 0,
    age: 0,
    trail: 0,
    glyphs: [],
  }
}

type Ctx = {
  p: FieldLayer
  chars: string
  rng: Rng
  width: number
  height: number
}

type Verb = {
  /** Particle count for a screen. */
  count(c: Ctx): number
  /** `anywhere` distributes over the whole screen; otherwise enter from the edge. */
  spawn(c: Ctx, anywhere: boolean, into: Particle): void
  advance(c: Ctx, particle: Particle): void
  /** True when the particle has left the screen and should respawn. */
  gone(c: Ctx, particle: Particle): boolean
  draw(c: Ctx, particle: Particle, s: FieldStyles, out: SceneGlyph[]): void
}

const TAU = Math.PI * 2

/** Columnar verbs scale with width; area verbs scale with the whole screen. */
const perColumn = (c: Ctx): number =>
  Math.max(1, Math.round(c.p.density * c.width))
const perArea = (c: Ctx): number =>
  Math.max(1, Math.round((c.p.density * c.width * c.height) / 100))

function pick(c: Ctx): string {
  return c.chars[(c.rng() * c.chars.length) | 0] ?? c.chars[0] ?? '·'
}

/** Ramp index for a position `f` (0 = head) along a run of `n` cells. */
function rampAt(s: FieldStyles, f: number, n: number): number {
  const i = Math.min(
    s.ramp.length - 1,
    ((f / Math.max(1, n)) * s.ramp.length) | 0,
  )
  return s.ramp[i] ?? s.head
}

/**
 * Falling columnar streams with a bright head and a fading trail.
 *
 * The RNG draw order here — trail, then one glyph per trail cell, then
 * column, then head position, then speed — is rain.ts's, exactly. Reordering
 * it changes every frame matrix has ever drawn.
 */
const fall: Verb = {
  count: perColumn,
  spawn(c, anywhere, into) {
    const trail =
      (c.p.trailMin + c.rng() * (c.p.trailMax - c.p.trailMin)) | 0 || 2
    const glyphs: string[] = []
    for (let i = 0; i < trail; i++) glyphs.push(pick(c))
    into.trail = trail
    into.glyphs = glyphs
    into.x = (c.rng() * c.width) | 0
    into.y = anywhere ? c.rng() * (c.height + trail) - trail : -c.rng() * trail
    into.vy = c.p.speedMin + c.rng() * (c.p.speedMax - c.p.speedMin)
    into.age = 0
  },
  advance(c, p) {
    const before = Math.floor(p.y)
    p.y += p.vy
    p.age++
    for (let step = Math.floor(p.y) - before; step > 0; step--) {
      p.glyphs.pop()
      p.glyphs.unshift(pick(c))
    }
    if (c.p.mutateRate > 0) {
      for (let i = 0; i < p.glyphs.length; i++) {
        if (c.rng() < c.p.mutateRate) p.glyphs[i] = pick(c)
      }
    }
  },
  gone: (c, p) => p.y - p.trail > c.height,
  draw(c, p, s, out) {
    const head = Math.floor(p.y)
    for (let i = 0; i < p.trail; i++) {
      const y = head - i
      if (y < 0 || y >= c.height) continue
      out.push({
        x: p.x,
        y,
        char: p.glyphs[i] ?? c.chars[0] ?? '·',
        styleId: i === 0 ? s.head : rampAt(s, i, p.trail),
      })
    }
  },
}

/**
 * Slow fall with a sine sway and a tumbling glyph — petals.ts's motion, and
 * its RNG order: centreline, height, fall speed, sway amplitude, phase, tint,
 * starting age.
 */
const drift: Verb = {
  count: perArea,
  spawn(c, anywhere, into) {
    into.x = c.rng() * c.width
    into.y = anywhere ? c.rng() * c.height : -c.rng() * 4 - 1
    into.vy = c.p.speedMin + c.rng() * (c.p.speedMax - c.p.speedMin)
    into.amp = c.p.swayAmp * (0.6 + c.rng() * 0.4)
    into.phase = c.rng() * TAU
    into.tint = (c.rng() * Math.max(1, c.chars.length)) | 0
    into.age = (c.rng() * c.p.swayPeriod) | 0
  },
  advance(_c, p) {
    p.y += p.vy
    p.age++
  },
  gone: (c, p) => p.y > c.height,
  draw(c, p, s, out) {
    const y = Math.floor(p.y)
    if (y < 0 || y >= c.height) return
    const x = Math.round(
      p.x + p.amp * Math.sin((TAU * p.age) / c.p.swayPeriod + p.phase),
    )
    if (x < 0 || x >= c.width) return
    out.push({ x, y, char: tumble(c, p), styleId: tintOf(c, p, s) })
  },
}

/** Embers and bubbles: the same drift, upward, entering from the bottom. */
const rise: Verb = {
  count: perArea,
  spawn(c, anywhere, into) {
    drift.spawn(c, anywhere, into)
    into.y = anywhere ? c.rng() * c.height : c.height + c.rng() * 4
    into.vy = -into.vy
  },
  advance: drift.advance,
  gone: (_c, p) => p.y < -1,
  draw: drift.draw,
}

/** Straight-line travel at an arbitrary angle: slanted snow, wind, meteors. */
const stream: Verb = {
  count: perColumn,
  spawn(c, anywhere, into) {
    const rad = (c.p.angle * Math.PI) / 180
    const speed = c.p.speedMin + c.rng() * (c.p.speedMax - c.p.speedMin)
    into.vx = Math.sin(rad) * speed
    into.vy = Math.cos(rad) * speed
    into.x = c.rng() * c.width
    into.y = anywhere ? c.rng() * c.height : into.vy >= 0 ? -1 : c.height + 1
    into.tint = (c.rng() * Math.max(1, c.chars.length)) | 0
    into.trail = (c.p.trailMin + c.rng() * (c.p.trailMax - c.p.trailMin)) | 0
    into.age = 0
    into.glyphs = [pick(c)]
  },
  advance(c, p) {
    p.x += p.vx
    p.y += p.vy
    p.age++
    if (c.p.mutateRate > 0 && c.rng() < c.p.mutateRate) p.glyphs[0] = pick(c)
  },
  gone: (c, p) =>
    p.y > c.height + 1 || p.y < -2 || p.x < -2 || p.x > c.width + 1,
  draw(c, p, s, out) {
    // The trail lies back along the direction of travel, so a steep angle
    // gives a diagonal streak rather than a vertical one.
    const n = Math.max(1, p.trail)
    const len = Math.hypot(p.vx, p.vy) || 1
    const ux = p.vx / len
    const uy = p.vy / len
    for (let i = 0; i < n; i++) {
      const x = Math.round(p.x - ux * i)
      const y = Math.round(p.y - uy * i)
      if (x < 0 || x >= c.width || y < 0 || y >= c.height) continue
      out.push({
        x,
        y,
        char: p.glyphs[0] ?? c.chars[0] ?? '·',
        styleId: i === 0 ? s.head : rampAt(s, i, n),
      })
    }
  },
}

/** Bands sweeping across the screen: scanlines, sonar, a radar wipe. */
const scan: Verb = {
  count: (c: Ctx): number => Math.max(1, Math.round(c.p.density * 6)),
  spawn(c, anywhere, into) {
    into.y = anywhere ? c.rng() * c.height : -c.rng() * 3 - 1
    into.vy = c.p.speedMin + c.rng() * (c.p.speedMax - c.p.speedMin)
    into.trail = Math.max(1, c.p.trailMin | 0)
    into.tint = (c.rng() * Math.max(1, c.chars.length)) | 0
    into.age = 0
    into.x = 0
  },
  advance(_c, p) {
    p.y += p.vy
    p.age++
  },
  gone: (c, p) => p.y - p.trail > c.height,
  draw(c, p, s, out) {
    // A band is width x trail cells, which on a wide screen is most of the
    // frame budget on its own. Stride keeps it a texture rather than a wall.
    const stride = Math.max(1, Math.round(1 / Math.min(1, c.p.density)))
    const char = c.chars[p.tint % c.chars.length] ?? '─'
    for (let i = 0; i < p.trail; i++) {
      const y = Math.floor(p.y) - i
      if (y < 0 || y >= c.height) continue
      const styleId = i === 0 ? s.head : rampAt(s, i, p.trail)
      for (let x = (p.age + i) % stride; x < c.width; x += stride) {
        out.push({ x, y, char, styleId })
      }
    }
  },
}

/** Ellipses about a centre: fireflies, electrons, dust in a sunbeam. */
const orbit: Verb = {
  count: perArea,
  spawn(c, _anywhere, into) {
    into.x = c.rng() * c.width
    into.y = c.rng() * c.height
    into.amp = 1 + c.rng() * Math.max(1, c.p.swayAmp)
    into.phase = c.rng() * TAU
    into.vy = c.p.speedMin + c.rng() * (c.p.speedMax - c.p.speedMin)
    into.tint = (c.rng() * Math.max(1, c.chars.length)) | 0
    into.age = (c.rng() * c.p.swayPeriod) | 0
    into.glyphs = [pick(c)]
  },
  advance(_c, p) {
    p.age++
  },
  // An orbit never leaves; respawning one would read as a glitch.
  gone: () => false,
  draw(c, p, s, out) {
    const a = (TAU * p.age * p.vy) / Math.max(1, c.p.swayPeriod) + p.phase
    // Half the vertical radius: terminal cells are about twice as tall as
    // they are wide, so an equal radius draws a visibly squashed ellipse.
    const x = Math.round(p.x + p.amp * Math.cos(a))
    const y = Math.round(p.y + p.amp * 0.5 * Math.sin(a))
    if (x < 0 || x >= c.width || y < 0 || y >= c.height) return
    out.push({ x, y, char: tumble(c, p), styleId: tintOf(c, p, s) })
  },
}

/** Stationary points fading on their own clock: stars, circuitry, windows. */
const twinkle: Verb = {
  count: perArea,
  spawn(c, _anywhere, into) {
    into.x = (c.rng() * c.width) | 0
    into.y = (c.rng() * c.height) | 0
    into.phase = c.rng() * TAU
    into.vy = 0.5 + c.rng()
    into.tint = (c.rng() * Math.max(1, c.chars.length)) | 0
    into.age = (c.rng() * c.p.swayPeriod) | 0
    into.glyphs = [pick(c)]
  },
  advance(_c, p) {
    p.age++
  },
  gone: () => false,
  draw(c, p, s, out) {
    const wave =
      0.5 +
      0.5 *
        Math.sin((TAU * p.age * p.vy) / Math.max(1, c.p.swayPeriod) + p.phase)
    const idx = Math.min(s.ramp.length - 1, (wave * s.ramp.length) | 0)
    out.push({
      x: p.x,
      y: p.y,
      char: tumble(c, p),
      styleId: s.ramp[idx] ?? s.head,
    })
  },
}

/** Glyph for a single-cell particle, cycling when tumblePeriod is set. */
function tumble(c: Ctx, p: Particle): string {
  const n = c.chars.length
  if (n === 0) return '·'
  if (c.p.tumblePeriod <= 0) return p.glyphs[0] ?? c.chars[p.tint % n] ?? '·'
  const phase = ((p.age / (c.p.tumblePeriod / n)) | 0) % n
  return c.chars[phase] ?? c.chars[0] ?? '·'
}

/** Style for a single-cell particle under the layer's fade mode. */
function tintOf(c: Ctx, p: Particle, s: FieldStyles): number {
  if (c.p.fade === 'twinkle') {
    const idx = Math.min(s.ramp.length - 1, (p.age % s.ramp.length) | 0)
    return s.ramp[idx] ?? s.head
  }
  return s.ramp[p.tint % s.ramp.length] ?? s.ramp[0] ?? s.head
}

const VERBS = new Map<string, Verb>([
  ['fall', fall],
  ['drift', drift],
  ['rise', rise],
  ['stream', stream],
  ['scan', scan],
  ['orbit', orbit],
  ['twinkle', twinkle],
])

/** Hard ceiling on particles, independent of screen size. */
const MAX_PARTICLES = 900

export function createFieldModel(
  params: FieldLayer,
  styles: FieldStyles,
  rng: Rng,
): SceneModel {
  const verb = VERBS.get(params.motion) ?? fall
  const chars = glyphCatalog(params.glyphs) ?? glyphCatalog('ascii') ?? '·'
  const ctx: Ctx = { p: params, chars, rng, width: 0, height: 0 }

  let particles: Particle[] = []
  let cache: SceneGlyph[] = []

  function rebuild(): void {
    const next: SceneGlyph[] = []
    for (const p of particles) verb.draw(ctx, p, styles, next)
    cache = next
  }

  return {
    resize(w: number, h: number): void {
      ctx.width = Math.max(1, w)
      ctx.height = Math.max(1, h)
      const target = Math.min(MAX_PARTICLES, verb.count(ctx))
      particles = []
      for (let i = 0; i < target; i++) {
        const p = blank()
        verb.spawn(ctx, true, p)
        particles.push(p)
      }
      rebuild()
    },

    tick(): void {
      for (const p of particles) {
        verb.advance(ctx, p)
        if (verb.gone(ctx, p)) verb.spawn(ctx, false, p)
      }
      rebuild()
    },

    cells(): ReadonlyArray<SceneGlyph> {
      return cache
    },
  }
}
