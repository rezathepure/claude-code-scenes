/**
 * Precedence-climbing parser for the shader expression language.
 *
 * The caps are enforced DURING the descent, not checked afterwards. A depth
 * counter that only runs at the end is a depth counter that runs after the
 * stack has already overflowed, and `((((((…))))))` is two characters per
 * level. Twenty-four levels is far past anything legible and far short of
 * anything dangerous.
 *
 * Names resolve here, once. Variables become integer slots into a Float64Array
 * and functions are checked for arity, so evaluation never looks a name up —
 * which is both faster and one fewer place for a lookup to be tricked.
 */

import { lex, type Token } from './lex.js'

export type Node =
  | { k: 'num'; v: number }
  | { k: 'var'; slot: number }
  | { k: 'call'; fn: string; args: Node[] }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'cond'; c: Node; a: Node; b: Node }

export type ParseOutcome =
  | { ok: true; node: Node; nodes: number }
  | { ok: false; error: string; index: number }

const MAX_DEPTH = 24
export const MAX_NODES = 128

/**
 * Variable slots. `u` and `v` are normalised 0–1 and are what the prompt
 * pushes: `sin(x/6)` looks different at 80 columns and at 200, `sin(u*13)`
 * does not.
 */
const VAR_SLOTS: ReadonlyMap<string, number> = new Map([
  ['x', 0],
  ['y', 1],
  ['u', 2],
  ['v', 3],
  ['t', 4],
  ['w', 5],
  ['h', 6],
  ['i', 7],
])

export const SLOT_COUNT = 8

/** Named constants, folded to literals at parse time. */
const CONSTANTS: ReadonlyMap<string, number> = new Map([
  ['pi', Math.PI],
  ['tau', Math.PI * 2],
  ['e', Math.E],
])

/** Function name → arity. A Map, never an object: these names come from a model. */
export const FUNCTIONS: ReadonlyMap<string, number> = new Map([
  ['sin', 1],
  ['cos', 1],
  ['tan', 1],
  ['asin', 1],
  ['acos', 1],
  ['atan', 1],
  ['abs', 1],
  ['floor', 1],
  ['ceil', 1],
  ['round', 1],
  ['sqrt', 1],
  ['exp', 1],
  ['log', 1],
  ['sign', 1],
  ['fract', 1],
  ['atan2', 2],
  ['min', 2],
  ['max', 2],
  ['pow', 2],
  ['mod', 2],
  ['hypot', 2],
  ['step', 2],
  ['noise', 2],
  ['clamp', 3],
  ['lerp', 3],
  ['smoothstep', 3],
])

/** Binary precedence, loosest first. */
const BINARY: ReadonlyArray<readonly string[]> = [
  ['||'],
  ['&&'],
  ['==', '!='],
  ['<', '<=', '>', '>='],
  ['+', '-'],
  ['*', '/', '%'],
]

export function parse(source: string): ParseOutcome {
  const lexed = lex(source)
  if (!lexed.ok) return { ok: false, error: lexed.error, index: lexed.index }

  const tokens = lexed.tokens
  let pos = 0
  let depth = 0
  let nodes = 0

  class Bail extends Error {
    constructor(
      readonly detail: string,
      readonly at: number,
    ) {
      super(detail)
    }
  }

  const peek = (): Token => tokens[pos]!
  // Explicitly annotated so TypeScript treats a call as terminating control
  // flow; an inferred `never` return does not narrow at the call site.
  const bail: (detail: string, at?: number) => never = (
    detail,
    at = peek().index,
  ) => {
    throw new Bail(detail, at)
  }
  const count = (): void => {
    if (++nodes > MAX_NODES)
      bail(`is too complicated (over ${MAX_NODES} terms)`)
  }

  function expr(): Node {
    if (++depth > MAX_DEPTH) bail(`nests more than ${MAX_DEPTH} levels deep`)
    const node = ternary()
    depth--
    return node
  }

  function ternary(): Node {
    const c = binary(0)
    if (peek().type === 'op' && peek().value === '?') {
      pos++
      const a = expr()
      if (peek().type !== 'op' || peek().value !== ':') {
        bail('has a "?" with no matching ":"')
      }
      pos++
      const b = expr()
      count()
      return { k: 'cond', c, a, b }
    }
    return c
  }

  function binary(level: number): Node {
    if (level >= BINARY.length) return unary()
    let left = binary(level + 1)
    for (;;) {
      const tok = peek()
      if (tok.type !== 'op' || !BINARY[level]!.includes(tok.value)) return left
      pos++
      const right = binary(level + 1)
      count()
      left = { k: 'bin', op: tok.value, a: left, b: right }
    }
  }

  function unary(): Node {
    const tok = peek()
    if (
      tok.type === 'op' &&
      (tok.value === '-' || tok.value === '+' || tok.value === '!')
    ) {
      pos++
      const a = unary()
      count()
      return tok.value === '+' ? a : { k: 'un', op: tok.value, a }
    }
    return power()
  }

  function power(): Node {
    const base = primary()
    const tok = peek()
    if (tok.type === 'op' && tok.value === '^') {
      pos++
      // Right-associative, and the exponent may itself be signed.
      const exp = unary()
      count()
      return { k: 'call', fn: 'pow', args: [base, exp] }
    }
    return base
  }

  function primary(): Node {
    const tok = peek()

    if (tok.type === 'num') {
      pos++
      count()
      return { k: 'num', v: tok.num }
    }

    if (tok.type === 'lparen') {
      pos++
      if (++depth > MAX_DEPTH) bail(`nests more than ${MAX_DEPTH} levels deep`)
      const inner = ternary()
      depth--
      if (peek().type !== 'rparen') bail('is missing a ")"')
      pos++
      return inner
    }

    if (tok.type === 'ident') {
      pos++
      const name = tok.value

      if (peek().type === 'lparen') {
        const arity = FUNCTIONS.get(name)
        if (arity === undefined) {
          bail(
            `calls "${name}", which is not one of the available functions`,
            tok.index,
          )
        }
        pos++
        const args: Node[] = []
        if (peek().type !== 'rparen') {
          for (;;) {
            args.push(expr())
            if (peek().type === 'comma') {
              pos++
              continue
            }
            break
          }
        }
        if (peek().type !== 'rparen') bail('is missing a ")"')
        pos++
        if (args.length !== arity) {
          bail(
            `calls ${name}() with ${args.length} argument${args.length === 1 ? '' : 's'}; it takes ${arity}`,
            tok.index,
          )
        }
        count()
        return { k: 'call', fn: name, args }
      }

      const constant = CONSTANTS.get(name)
      if (constant !== undefined) {
        count()
        return { k: 'num', v: constant }
      }

      const slot = VAR_SLOTS.get(name)
      if (slot === undefined) {
        if (FUNCTIONS.has(name)) {
          bail(
            `mentions ${name} without calling it — write ${name}(…)`,
            tok.index,
          )
        }
        bail(
          `uses "${name}", which is not one of the available names`,
          tok.index,
        )
      }
      count()
      return { k: 'var', slot }
    }

    bail(
      tok.type === 'eof'
        ? 'ends unexpectedly'
        : `has an unexpected "${tok.value}"`,
    )
    // Unreachable; bail always throws.
    return { k: 'num', v: 0 }
  }

  try {
    if (peek().type === 'eof') {
      return { ok: false, error: 'is empty', index: 0 }
    }
    const node = expr()
    if (peek().type !== 'eof') {
      return {
        ok: false,
        error: `has unexpected trailing input`,
        index: peek().index,
      }
    }
    return { ok: true, node, nodes }
  } catch (error) {
    if (error instanceof Bail) {
      return { ok: false, error: error.detail, index: error.at }
    }
    // A parser bug, not a bad expression. Report it as a bad expression
    // anyway: the caller's job is to drop the layer, not to crash the app.
    return { ok: false, error: 'could not be understood', index: 0 }
  }
}
