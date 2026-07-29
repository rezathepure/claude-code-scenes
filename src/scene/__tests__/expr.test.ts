/**
 * The expression sandbox.
 *
 * A theme file is meant to be shared. Everything else in the scene format is
 * inert data, but a shader carries a formula the machine receiving it will
 * evaluate — so a hole here is a hole in someone else's terminal, not just a
 * broken animation. These tests are the argument that there is no hole:
 * nothing reaches a `Function` constructor, no name resolves to anything but
 * a whitelisted slot, and no input reaches the evaluator without passing a
 * bounded parser first.
 *
 * The fuzz test is the most valuable one here. Hand-picked hostile inputs
 * prove the attacks you thought of; ten thousand random strings prove the
 * parser never throws for the ones you did not.
 */

import { describe, expect, test } from 'bun:test'
import { compileExpression, SLOT_COUNT } from '../expr/index.js'
import { MAX_NODES } from '../expr/parse.js'

const env = (over: Partial<Record<number, number>> = {}): Float64Array => {
  const e = new Float64Array(SLOT_COUNT)
  for (const [k, v] of Object.entries(over)) e[Number(k)] = v as number
  return e
}

function evaluate(src: string, e = env()): number {
  const r = compileExpression(src)
  if (!r.ok) throw new Error(`${src} → ${r.error}`)
  return r.evaluate(e)
}

describe('what the language can do', () => {
  test('evaluates arithmetic with the usual precedence', () => {
    expect(evaluate('1 + 2 * 3')).toBe(7)
    expect(evaluate('(1 + 2) * 3')).toBe(9)
    expect(evaluate('10 % 3')).toBe(1)
    expect(evaluate('2 ^ 10')).toBe(1024)
    expect(evaluate('-3 + 1')).toBe(-2)
  })

  test('reads the variables a shader is given', () => {
    expect(evaluate('u * 2 + v', env({ 2: 0.5, 3: 0.25 }))).toBe(1.25)
    expect(evaluate('t', env({ 4: 42 }))).toBe(42)
  })

  test('accepts the constants and functions it documents', () => {
    expect(evaluate('sin(pi / 2)')).toBeCloseTo(1, 10)
    expect(evaluate('clamp(5, 0, 1)')).toBe(1)
    expect(evaluate('lerp(0, 10, 0.5)')).toBe(5)
    expect(evaluate('smoothstep(0, 1, 0.5)')).toBe(0.5)
    expect(evaluate('hypot(3, 4)')).toBe(5)
    expect(evaluate('step(0.5, 0.7)')).toBe(1)
  })

  test('supports comparisons and a ternary', () => {
    expect(evaluate('1 < 2')).toBe(1)
    expect(evaluate('u > 0.5 ? 10 : 20', env({ 2: 0.9 }))).toBe(10)
    expect(evaluate('u > 0.5 ? 10 : 20', env({ 2: 0.1 }))).toBe(20)
  })

  test('is case-insensitive, because models write SIN and PI', () => {
    expect(evaluate('SIN(PI / 2)')).toBeCloseTo(1, 10)
  })

  test('noise is a pure function of its arguments', () => {
    // Not Math.random: a resize must not reshuffle the picture, and the
    // frozen-output tests depend on a frame being reproducible.
    const a = evaluate('noise(3, 7)')
    const b = evaluate('noise(3, 7)')
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(1)
    expect(evaluate('noise(3, 8)')).not.toBe(a)
  })
})

describe('what the language refuses', () => {
  const rejected: Array<[string, string]> = [
    ['escaping to javascript', "new Function('return 1')"],
    ['the constructor property', 'constructor(1)'],
    ['prototype pollution', '__proto__'],
    ['property access', 'x.constructor'],
    ['indexing', 'x[0]'],
    ['statement separators', '1;2'],
    ['string literals', '"abc"'],
    ['template literals', ['`$', '{x}`'].join('')],
    ['backslashes', 'x \\ y'],
    ['braces', '{x}'],
    ['comments', '1 # 2'],
    ['assignment', 'x = 1'],
    ['a bare function name', 'sin'],
    ['too many arguments', 'sin(1, 2)'],
    ['too few arguments', 'min(1)'],
    ['an unknown name', 'frobnicate(1)'],
    ['an unknown variable', 'q + 1'],
    ['exponent notation', '9e99'],
    ['an over-large number', '9999999'],
    ['a homoglyph identifier', 'ѕin(x)'],
    ['an empty expression', ''],
    ['whitespace only', '   '],
    ['trailing garbage', '1+2)'],
    ['an unclosed paren', '(1+2'],
    ['a dangling operator', '1 +'],
    ['a stray decimal point', '1..2'],
    ['a ternary with no colon', '1 ? 2'],
  ]

  for (const [what, source] of rejected) {
    test(`rejects ${what}`, () => {
      const r = compileExpression(source)
      expect(r.ok).toBe(false)
    })
  }

  test('rejects deep nesting without overflowing the stack', () => {
    const deep = `${'('.repeat(64)}1${')'.repeat(64)}`
    expect(() => compileExpression(deep)).not.toThrow()
    expect(compileExpression(deep).ok).toBe(false)
  })

  test('rejects an expression with too many terms', () => {
    const long = `1${'+1'.repeat(200)}`
    expect(compileExpression(long).ok).toBe(false)
  })

  test('rejects a source longer than the cap before lexing it', () => {
    expect(compileExpression('1+'.repeat(5000)).ok).toBe(false)
  })

  test('rejects an expression that never produces a number', () => {
    // Parses perfectly, draws nothing, forever. Better a warning at load.
    expect(compileExpression('sqrt(0 - 1)').ok).toBe(false)
  })
})

describe('non-finite values', () => {
  test('are contained rather than thrown', () => {
    // Guarded at the single output boundary: a NaN cell is an unlit cell.
    for (const src of ['1 / 0', 'log(0)', 'tan(pi / 2)', '0 / 0 + 1']) {
      const r = compileExpression(src)
      // Either rejected at compile time by the finite sweep, or safe to run.
      if (r.ok) expect(() => r.evaluate(env())).not.toThrow()
    }
  })
})

describe('bounds', () => {
  test('a compiled expression never exceeds the node cap', () => {
    const r = compileExpression(
      'sin(u*9 + t/14) * sin(v*7 - t/23) + noise(x,y)',
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.nodes).toBeLessThanOrEqual(MAX_NODES)
  })

  test('evaluates four thousand cells well inside the frame budget', () => {
    // The scene controller kills the animation at a 12ms mean tick, silently.
    const r = compileExpression('sin(u*11 + t/13) * sin(v*6 - t/21)')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const e = env()
    const start = performance.now()
    for (let i = 0; i < 4000; i++) {
      e[2] = (i % 80) / 80
      e[3] = ((i / 80) | 0) / 50
      r.evaluate(e)
    }
    expect(performance.now() - start).toBeLessThan(5)
  })
})

describe('fuzzing', () => {
  test('ten thousand random strings never throw', () => {
    // The hand-written cases above prove the attacks I thought of. This one
    // covers the ones I did not: whatever comes out, compileExpression must
    // return rather than throw, and anything it accepts must be safe to run.
    const alphabet =
      '0123456789abcdefghijklmnopqrstuvwxyz+-*/%^()<>=!&|?:,. \t\'"`[]{};\\#$~ѕ漢🕷'
    let rng = 0x2545f491
    const next = (): number => {
      rng = (Math.imul(rng ^ (rng >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0
      return rng / 4294967296
    }

    let accepted = 0
    for (let n = 0; n < 10000; n++) {
      const len = 1 + ((next() * 120) | 0)
      let s = ''
      for (let i = 0; i < len; i++) {
        s += alphabet[(next() * alphabet.length) | 0]
      }

      let outcome: ReturnType<typeof compileExpression>
      expect(() => {
        outcome = compileExpression(s)
      }).not.toThrow()

      const r = outcome!
      if (r.ok) {
        accepted++
        const e = env()
        for (let t = 0; t < 5; t++) {
          e[0] = t * 7
          e[1] = t * 3
          e[2] = t / 4
          e[3] = t / 4
          e[4] = t * 11
          expect(() => r.evaluate(e)).not.toThrow()
        }
      }
    }
    // Sanity: if nothing was ever accepted the fuzzer is only proving that
    // the lexer rejects noise, which is a much weaker claim.
    expect(accepted).toBeGreaterThan(0)
  })
})
