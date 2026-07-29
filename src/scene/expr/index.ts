/**
 * Compiles a parsed expression into a closure tree.
 *
 * Compilation happens ONCE, when a theme's scene is built — never per frame
 * and never per cell. What evaluation sees is a tree of tiny closures over a
 * Float64Array of variables: no name lookup, no switch dispatch, no allocation.
 *
 * Non-finite results are caught at the single output boundary rather than at
 * every node. Guarding per node costs about a third of the run time and hides
 * which operation actually produced the NaN; guarding once means `log(0)`
 * yields an unlit cell, which is both the least surprising thing to look at
 * and structurally incapable of corrupting the cell buffer.
 */

import { type Node, parse, SLOT_COUNT } from './parse.js'

export { FUNCTIONS, SLOT_COUNT } from './parse.js'

export type Evaluator = (env: Float64Array) => number

export type CompileOutcome =
  | { ok: true; evaluate: Evaluator; nodes: number }
  | { ok: false; error: string; index: number }

/**
 * Deterministic value noise.
 *
 * Integer hashing, not `Math.random`: a scene must draw the same frame for
 * the same tick whatever else has happened, or a resize would reshuffle the
 * whole picture and the frozen-output tests would be meaningless.
 */
function noise(a: number, b: number): number {
  let h =
    (Math.imul(Math.floor(a) | 0, 0x27d4eb2d) ^
      Math.imul(Math.floor(b) | 0, 0x165667b1)) >>>
    0
  h = Math.imul(h ^ (h >>> 15), 0x2545f491) >>> 0
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

const fract = (x: number): number => x - Math.floor(x)

type Fn1 = (a: number) => number
type Fn2 = (a: number, b: number) => number
type Fn3 = (a: number, b: number, c: number) => number

const F1 = new Map<string, Fn1>([
  ['sin', Math.sin],
  ['cos', Math.cos],
  ['tan', Math.tan],
  ['asin', Math.asin],
  ['acos', Math.acos],
  ['atan', Math.atan],
  ['abs', Math.abs],
  ['floor', Math.floor],
  ['ceil', Math.ceil],
  ['round', Math.round],
  ['sqrt', Math.sqrt],
  ['exp', Math.exp],
  ['log', Math.log],
  ['sign', Math.sign],
  ['fract', fract],
])

const F2 = new Map<string, Fn2>([
  ['atan2', Math.atan2],
  ['min', Math.min],
  ['max', Math.max],
  ['pow', Math.pow],
  ['mod', (a, b) => (b === 0 ? 0 : a - Math.floor(a / b) * b)],
  ['hypot', Math.hypot],
  ['step', (edge, x) => (x < edge ? 0 : 1)],
  ['noise', noise],
])

const F3 = new Map<string, Fn3>([
  ['clamp', (x, lo, hi) => Math.min(Math.max(x, lo), hi)],
  ['lerp', (a, b, t) => a + (b - a) * t],
  [
    'smoothstep',
    (lo, hi, x) => {
      const t = Math.min(1, Math.max(0, hi === lo ? 0 : (x - lo) / (hi - lo)))
      return t * t * (3 - 2 * t)
    },
  ],
])

function build(node: Node): Evaluator {
  switch (node.k) {
    case 'num': {
      const v = node.v
      return () => v
    }
    case 'var': {
      const slot = node.slot
      return env => env[slot]!
    }
    case 'un': {
      const a = build(node.a)
      return node.op === '-' ? env => -a(env) : env => (a(env) === 0 ? 1 : 0)
    }
    case 'cond': {
      const c = build(node.c)
      const a = build(node.a)
      const b = build(node.b)
      return env => (c(env) !== 0 ? a(env) : b(env))
    }
    case 'call': {
      const args = node.args.map(build)
      if (args.length === 1) {
        const f = F1.get(node.fn)!
        const a = args[0]!
        return env => f(a(env))
      }
      if (args.length === 2) {
        const f = F2.get(node.fn)!
        const a = args[0]!
        const b = args[1]!
        return env => f(a(env), b(env))
      }
      const f = F3.get(node.fn)!
      const a = args[0]!
      const b = args[1]!
      const c = args[2]!
      return env => f(a(env), b(env), c(env))
    }
    case 'bin': {
      const a = build(node.a)
      const b = build(node.b)
      switch (node.op) {
        case '+':
          return env => a(env) + b(env)
        case '-':
          return env => a(env) - b(env)
        case '*':
          return env => a(env) * b(env)
        case '/':
          return env => a(env) / b(env)
        case '%':
          return env => a(env) % b(env)
        case '<':
          return env => (a(env) < b(env) ? 1 : 0)
        case '<=':
          return env => (a(env) <= b(env) ? 1 : 0)
        case '>':
          return env => (a(env) > b(env) ? 1 : 0)
        case '>=':
          return env => (a(env) >= b(env) ? 1 : 0)
        case '==':
          return env => (a(env) === b(env) ? 1 : 0)
        case '!=':
          return env => (a(env) !== b(env) ? 1 : 0)
        case '&&':
          return env => (a(env) !== 0 && b(env) !== 0 ? 1 : 0)
        default:
          return env => (a(env) !== 0 || b(env) !== 0 ? 1 : 0)
      }
    }
  }
}

/**
 * How many of a sample grid must produce a finite number for the expression
 * to be worth keeping. `log(0-1)` parses perfectly and draws nothing forever;
 * catching that at load gives the author a warning instead of a mystery.
 */
const FINITE_SAMPLES = 5
const FINITE_MIN_RATIO = 0.1

export function compileExpression(source: string): CompileOutcome {
  const parsed = parse(source)
  if (!parsed.ok) return parsed

  const evaluate = build(parsed.node)

  const env = new Float64Array(SLOT_COUNT)
  let finite = 0
  let total = 0
  for (let a = 0; a < FINITE_SAMPLES; a++) {
    for (let b = 0; b < FINITE_SAMPLES; b++) {
      for (let c = 0; c < FINITE_SAMPLES; c++) {
        env[0] = a * 10
        env[1] = b * 10
        env[2] = a / (FINITE_SAMPLES - 1)
        env[3] = b / (FINITE_SAMPLES - 1)
        env[4] = c * 37
        env[5] = 80
        env[6] = 24
        env[7] = a
        total++
        if (Number.isFinite(evaluate(env))) finite++
      }
    }
  }
  if (finite / total < FINITE_MIN_RATIO) {
    return {
      ok: false,
      error: 'almost never produces a usable number',
      index: 0,
    }
  }

  return { ok: true, evaluate, nodes: parsed.nodes }
}
