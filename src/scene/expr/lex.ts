/**
 * Tokeniser for the shader expression language.
 *
 * This is the outermost wall of a sandbox, so it is a WHITELIST: a character
 * that is not explicitly allowed ends the lex, and there is no escape hatch.
 * That single rule disposes of quotes, brackets, semicolons, braces, backslash
 * and every non-ASCII code point — which means no strings, no property access,
 * no statement separators, and no Cyrillic `с` masquerading as `c`.
 *
 * Exponent notation is deliberately absent. `1e308` is three harmless-looking
 * characters that produce an infinity, and the language has no need for it.
 * Magnitudes are capped for the same reason.
 *
 * Nothing here evaluates anything. `new Function` and `eval` appear nowhere in
 * this directory, and that is the property the whole design rests on: a theme
 * file is shared between people, so an expression it carries must be data that
 * we interpret, never code that we run.
 */

export type TokenType =
  | 'num'
  | 'ident'
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'eof'

export type Token = {
  type: TokenType
  value: string
  num: number
  /** Offset in the source, for error messages. */
  index: number
}

export type LexOutcome =
  | { ok: true; tokens: Token[] }
  | { ok: false; error: string; index: number }

/** Longer than any legible formula, short enough to bound every later pass. */
const MAX_LENGTH = 120
const MAX_TOKENS = 96
/** Beyond this a literal is a denial-of-service attempt, not a number. */
const MAX_MAGNITUDE = 1e6

const DIGIT = /[0-9]/
const IDENT_START = /[a-z]/
const IDENT_BODY = /[a-z0-9_]/
const MAX_IDENT = 16

/** Every character the language may contain. Anything else is a lex error. */
const ALLOWED = new Set(
  '0123456789abcdefghijklmnopqrstuvwxyz_.+-*/%^()<>=!&|?:, \t'.split(''),
)

/** Two-character operators, checked before their single-character prefixes. */
const OPS2 = ['<=', '>=', '==', '!=', '&&', '||']
const OPS1 = '+-*/%^<>!?:'.split('')

export function lex(source: string): LexOutcome {
  if (source.length > MAX_LENGTH) {
    return {
      ok: false,
      error: `is longer than ${MAX_LENGTH} characters`,
      index: MAX_LENGTH,
    }
  }

  // Case-folded up front: models write `PI` and `SIN`, and ASCII folding is
  // total, so accepting them costs nothing and rejects nothing.
  const src = source.toLowerCase()
  const tokens: Token[] = []
  let i = 0

  const fail = (error: string, index: number): LexOutcome => ({
    ok: false,
    error,
    index,
  })

  while (i < src.length) {
    const ch = src[i]!

    if (!ALLOWED.has(ch)) {
      return fail(
        `contains ${JSON.stringify(source[i])}, which is not allowed in an expression`,
        i,
      )
    }
    if (ch === ' ' || ch === '\t') {
      i++
      continue
    }
    if (tokens.length >= MAX_TOKENS) {
      return fail(`has more than ${MAX_TOKENS} terms`, i)
    }

    if (DIGIT.test(ch)) {
      const start = i
      while (i < src.length && DIGIT.test(src[i]!)) i++
      if (src[i] === '.') {
        i++
        if (i >= src.length || !DIGIT.test(src[i]!)) {
          return fail('has a decimal point with no digits after it', i)
        }
        while (i < src.length && DIGIT.test(src[i]!)) i++
      }
      const text = src.slice(start, i)
      const num = Number(text)
      if (!Number.isFinite(num) || Math.abs(num) > MAX_MAGNITUDE) {
        return fail(`has the number ${text}, which is too large`, start)
      }
      tokens.push({ type: 'num', value: text, num, index: start })
      continue
    }

    if (ch === '.') {
      return fail('has a stray "."', i)
    }

    if (IDENT_START.test(ch)) {
      const start = i
      while (i < src.length && IDENT_BODY.test(src[i]!)) i++
      const text = src.slice(start, i)
      if (text.length > MAX_IDENT) {
        return fail(`has an over-long name "${text}"`, start)
      }
      tokens.push({ type: 'ident', value: text, num: 0, index: start })
      continue
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch, num: 0, index: i++ })
      continue
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch, num: 0, index: i++ })
      continue
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ch, num: 0, index: i++ })
      continue
    }

    const two = src.slice(i, i + 2)
    if (OPS2.includes(two)) {
      tokens.push({ type: 'op', value: two, num: 0, index: i })
      i += 2
      continue
    }
    if (OPS1.includes(ch)) {
      tokens.push({ type: 'op', value: ch, num: 0, index: i++ })
      continue
    }

    // `=`, `&` and `|` on their own reach here: allowed as characters only so
    // that `==`, `&&` and `||` can be recognised.
    return fail(`has a stray ${JSON.stringify(source[i])}`, i)
  }

  tokens.push({ type: 'eof', value: '', num: 0, index: src.length })
  return { ok: true, tokens }
}
