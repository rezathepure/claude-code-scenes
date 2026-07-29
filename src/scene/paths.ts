/**
 * Where a sprite is at a given tick.
 *
 * Every path is a PURE FUNCTION of the tick count — no state, no rng, no
 * accumulation. That buys three things: a path is trivially unit-testable, a
 * resize cannot make a sprite jump, and there is no drift to accumulate over
 * the hours a session runs.
 *
 * Positions are the sprite's top-left corner in cells, fractional; the player
 * rounds. Travel is expressed as a triangle wave rather than a sawtooth
 * wherever the sprite would otherwise have to teleport back to its start — a
 * spider that reappears at the ceiling reads as a glitch, one that climbs its
 * silk reads as a spider.
 */

const TAU = Math.PI * 2

export type PathInput = {
  /** Ticks elapsed, already offset for this instance. */
  t: number
  period: number
  /** Screen size in cells. */
  w: number
  h: number
  /** Sprite size in cells. */
  sw: number
  sh: number
  /** Start position as a fraction of the screen. */
  x: number
  y: number
  /** Travel extent as a fraction of the screen. */
  span: number
}

export type Point = { x: number; y: number }

/** 0 → 1 → 0 over one period. */
function triangle(t: number, period: number): number {
  const phase = ((t % period) + period) % period
  const half = period / 2
  return phase < half ? phase / half : 2 - phase / half
}

type PathFn = (i: PathInput) => Point

const descend: PathFn = i => ({
  x: i.x * (i.w - i.sw),
  y: i.y * (i.h - i.sh) + triangle(i.t, i.period) * i.span * (i.h - i.sh),
})

const ascend: PathFn = i => ({
  x: i.x * (i.w - i.sw),
  y: (i.h - i.sh) * (1 - i.y) - triangle(i.t, i.period) * i.span * (i.h - i.sh),
})

const patrol: PathFn = i => ({
  x: i.x * (i.w - i.sw) + triangle(i.t, i.period) * i.span * (i.w - i.sw),
  y: i.y * (i.h - i.sh),
})

const crawl: PathFn = i => ({
  x: triangle(i.t, i.period) * (i.w - i.sw),
  y: i.h - i.sh,
})

const orbit: PathFn = i => {
  const a = (TAU * i.t) / i.period
  // Half the vertical radius: terminal cells are about twice as tall as wide,
  // so equal radii draw a visibly squashed ellipse.
  const rx = (i.span * (i.w - i.sw)) / 2
  const ry = (i.span * (i.h - i.sh)) / 4
  return {
    x: i.x * (i.w - i.sw) + rx * Math.cos(a),
    y: i.y * (i.h - i.sh) + ry * Math.sin(a),
  }
}

const hover: PathFn = i => ({
  x: i.x * (i.w - i.sw) + Math.sin((TAU * i.t) / i.period) * 1.5,
  y: i.y * (i.h - i.sh) + Math.sin((TAU * i.t) / (i.period * 0.7)) * 1,
})

const still: PathFn = i => ({
  x: i.x * (i.w - i.sw),
  y: i.y * (i.h - i.sh),
})

/** A Map, not a literal: `path` comes from a model. */
const PATHS = new Map<string, PathFn>([
  ['descend', descend],
  ['ascend', ascend],
  ['patrol', patrol],
  ['crawl', crawl],
  ['orbit', orbit],
  ['hover', hover],
  ['static', still],
])

export function pathAt(name: string, input: PathInput): Point {
  return (PATHS.get(name) ?? still)(input)
}

/** True when the path leaves a meaningful trail behind the sprite. */
export function pathHasTrail(name: string): boolean {
  return name === 'descend' || name === 'ascend'
}
