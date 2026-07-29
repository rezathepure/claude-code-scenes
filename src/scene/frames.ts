/**
 * Validation for model-drawn sprite art.
 *
 * Field layers name a fixed catalog and can never paint an arbitrary
 * character. Sprites are the one place that rule relaxes — a spider has to be
 * drawn, not selected — so the safety has to come from somewhere else, and it
 * comes from an explicit code-point allow-list.
 *
 * The ranges below are not a guess about what "looks like a normal
 * character": every code point in every range is asserted width-1 by a test
 * that enumerates them. Ranges that failed were narrowed until they passed
 * (geometric shapes stops at U+25FC because U+25FD and U+25FE are wide) and
 * ranges that failed badly were dropped outright (dingbats, miscellaneous
 * symbols and miscellaneous technical are riddled with emoji-width members).
 * Sparkles and snowflakes are still reachable — through a field layer's
 * catalog, which is the right home for texture anyway.
 *
 * Excluding everything outside these ranges also disposes of grapheme
 * clusters, combining marks, ZWJ sequences and astral code points in one
 * move. Every allowed character is BMP and width-1, so a row's `.length` is
 * both its display width and a safe index space.
 */

import { stringWidth } from '@anthropic/ink'
import type { FramesSpec } from './grammar.js'

/** [first, last] inclusive. Every member is verified width-1 by a test. */
export const FRAME_CHAR_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0020, 0x007e], // ASCII printable — the backbone of terminal art
  [0x2010, 0x205e], // general punctuation: dashes, quotes, bullets, ellipsis
  [0x2190, 0x21ff], // arrows
  [0x2200, 0x22ff], // mathematical operators
  [0x2500, 0x257f], // box drawing
  [0x2580, 0x259f], // block elements
  [0x25a0, 0x25fc], // geometric shapes (U+25FD/FE are wide)
  [0x2800, 0x28ff], // braille — dense shading, blank in some fonts
]

function isAllowedCodePoint(cp: number): boolean {
  for (const [lo, hi] of FRAME_CHAR_RANGES) {
    if (cp >= lo && cp <= hi) return true
  }
  return false
}

/** True when a single character may be drawn — used for sprite trail chars. */
export function isDrawableChar(ch: string): boolean {
  if (ch.length === 0) return false
  const cp = ch.codePointAt(0) ?? 0
  return String.fromCodePoint(cp) === ch && isAllowedCodePoint(cp) && ch !== ' '
}

export type ValidatedFrames = {
  /** frames[f][row] — a row string, indexable by column. */
  frames: readonly (readonly string[])[]
  width: number
  height: number
}

export type FramesOutcome =
  | { ok: true; value: ValidatedFrames }
  | { ok: false; error: string }

/**
 * Checks drawn art against its spec. Any failure rejects the WHOLE sprite:
 * a half-validated sprite renders as debris, which is worse than no sprite,
 * and the caller has a warning to explain itself with.
 */
export function validateFrames(raw: unknown, spec: FramesSpec): FramesOutcome {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: 'must be a non-empty array of frames' }
  }
  if (raw.length > spec.maxFrames) {
    return {
      ok: false,
      error: `has ${raw.length} frames; the most allowed is ${spec.maxFrames}`,
    }
  }

  const frames: string[][] = []
  let width = -1
  let height = -1

  for (let f = 0; f < raw.length; f++) {
    const frame = raw[f]
    if (!Array.isArray(frame) || frame.length === 0) {
      return {
        ok: false,
        error: `frame ${f} must be a non-empty array of rows`,
      }
    }
    if (frame.length > spec.maxRows) {
      return {
        ok: false,
        error: `frame ${f} has ${frame.length} rows; the most allowed is ${spec.maxRows}`,
      }
    }
    if (height === -1) {
      height = frame.length
    } else if (frame.length !== height) {
      // Non-uniform frames would make the sprite change size mid-animation,
      // which reads as corruption rather than motion.
      return {
        ok: false,
        error: `frame ${f} has ${frame.length} rows but frame 0 has ${height}; every frame must be the same size`,
      }
    }

    const rows: string[] = []
    for (let r = 0; r < frame.length; r++) {
      const row: unknown = frame[r]
      if (typeof row !== 'string') {
        return { ok: false, error: `frame ${f} row ${r} must be a string` }
      }
      for (const ch of row) {
        const cp = ch.codePointAt(0) ?? 0
        if (!isAllowedCodePoint(cp)) {
          return {
            ok: false,
            error: `frame ${f} row ${r} contains ${JSON.stringify(ch)} (U+${cp.toString(16).toUpperCase()}), which is not a drawable character`,
          }
        }
      }
      // Every allowed code point is BMP and width-1, so these must agree.
      // If they ever disagree the allow-list has been widened wrongly.
      if (row.length !== stringWidth(row)) {
        return {
          ok: false,
          error: `frame ${f} row ${r} does not measure one column per character`,
        }
      }
      if (row.length > spec.maxCols) {
        return {
          ok: false,
          error: `frame ${f} row ${r} is ${row.length} columns; the most allowed is ${spec.maxCols}`,
        }
      }
      if (width === -1) {
        width = row.length
      } else if (row.length !== width) {
        return {
          ok: false,
          error: `frame ${f} row ${r} is ${row.length} columns but the first row is ${width}; pad rows with spaces so every row is the same width`,
        }
      }
      rows.push(row)
    }
    frames.push(rows)
  }

  if (width <= 0 || height <= 0) {
    return { ok: false, error: 'has no drawable content' }
  }
  if (width * height * frames.length > spec.maxCells) {
    return {
      ok: false,
      error: `is ${width}x${height} over ${frames.length} frames, which exceeds the ${spec.maxCells}-cell limit`,
    }
  }

  return { ok: true, value: { frames, width, height } }
}
