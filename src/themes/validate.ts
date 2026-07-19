/**
 * Validates and repairs a theme's colours.
 *
 * The governing choice: **repair, never reject**. A generated theme that gets
 * thrown away costs the user a round trip and usually fails again the same
 * way. Instead any slot that cannot be read is nudged along its lightness
 * axis until it can, keeping hue and chroma — so the author's intent survives
 * and only the unreadable part changes. See colorMath.repairContrast.
 *
 * Slots that already pass are returned byte-identical. For hand-designed
 * themes that means the validator is a no-op, which is the calibration
 * target: if Matrix or Sakura come out modified, the floors are wrong.
 */

import { isTerminalPaletteColor, parseColor, type Rgb } from '../utils/color.js'
import {
  contrastRatio,
  perceptualDistance,
  repairContrast,
} from '../utils/colorMath.js'
import {
  ASSUMED_TERMINAL_BACKGROUND,
  BODY_TEXT_FLOOR,
  BODY_TEXT_SLOT,
  DISTINCT_GROUPS,
  DISTINCTNESS_FLOOR,
  SEMANTIC_TEXT_FLOOR,
  SEMANTIC_TEXT_SLOTS,
} from './slots.js'

export type ThemeMode = 'dark' | 'light'

export type ThemeIssue =
  | {
      kind: 'unparseable'
      slot: string
      value: string
    }
  | {
      kind: 'repaired-contrast'
      slot: string
      from: string
      to: string
      ratioBefore: number
      ratioAfter: number
      floor: number
    }
  | {
      kind: 'unreadable'
      slot: string
      value: string
      ratio: number
      floor: number
    }
  | {
      kind: 'indistinct'
      slots: [string, string]
      distance: number
      why: string
    }

export type ValidationResult = {
  /** The colours to actually use, with repairs applied. */
  colors: Record<string, string>
  /** Everything worth telling the theme's author about. */
  issues: ThemeIssue[]
}

function formatRgb(c: Rgb): string {
  return `rgb(${c.r},${c.g},${c.b})`
}

/**
 * Checks a slot that should be legible as text, repairing it if it is not.
 * Returns the value to use.
 */
function checkReadable(
  slot: string,
  value: string,
  background: Rgb,
  floor: number,
  issues: ThemeIssue[],
): string {
  // ANSI palette values are whatever the user's terminal says they are, so a
  // computed ratio would be fiction. Skip rather than guess.
  if (isTerminalPaletteColor(value)) {
    return value
  }

  const parsed = parseColor(value)
  if (!parsed) {
    // Reported by the caller's parse sweep; nothing sensible to repair.
    return value
  }

  const before = contrastRatio(parsed, background)
  if (before >= floor) {
    return value
  }

  const repaired = repairContrast(parsed, background, floor)
  const after = contrastRatio(repaired, background)

  if (after < floor) {
    // Can happen when the assumed background is mid-tone; nothing reaches the
    // bar. Report honestly instead of pretending the repair worked.
    issues.push({ kind: 'unreadable', slot, value, ratio: after, floor })
  } else {
    issues.push({
      kind: 'repaired-contrast',
      slot,
      from: value,
      to: formatRgb(repaired),
      ratioBefore: before,
      ratioAfter: after,
      floor,
    })
  }

  return formatRgb(repaired)
}

/**
 * Validates a complete set of theme colours for the given mode.
 *
 * `colors` is expected to already be complete — missing slots are filled from
 * the mode's built-in theme before this runs (see resolveThemeColors), so
 * that validation sees what will actually be rendered.
 */
export function validateThemeColors(
  colors: Record<string, string>,
  mode: ThemeMode,
): ValidationResult {
  const issues: ThemeIssue[] = []
  const background = ASSUMED_TERMINAL_BACKGROUND[mode]
  const out: Record<string, string> = { ...colors }

  // 1. Everything must be a colour the renderer will actually paint.
  for (const [slot, value] of Object.entries(out)) {
    if (parseColor(value) === null) {
      issues.push({ kind: 'unparseable', slot, value })
    }
  }

  // 2. Readability, with repair.
  if (typeof out[BODY_TEXT_SLOT] === 'string') {
    out[BODY_TEXT_SLOT] = checkReadable(
      BODY_TEXT_SLOT,
      out[BODY_TEXT_SLOT],
      background,
      BODY_TEXT_FLOOR,
      issues,
    )
  }
  for (const slot of SEMANTIC_TEXT_SLOTS) {
    const value = out[slot]
    if (typeof value === 'string') {
      out[slot] = checkReadable(
        slot,
        value,
        background,
        SEMANTIC_TEXT_FLOOR,
        issues,
      )
    }
  }

  // 3. Distinctness, reported but not repaired.
  //
  // Repair is not attempted here on purpose: moving one colour away from
  // another has no single right answer (which one should move, and toward
  // what?) and would fight the contrast repair above. Author's call.
  for (const group of DISTINCT_GROUPS) {
    for (let i = 0; i < group.slots.length; i++) {
      for (let j = i + 1; j < group.slots.length; j++) {
        const slotA = group.slots[i]!
        const slotB = group.slots[j]!
        const rawA = out[slotA]
        const rawB = out[slotB]
        if (typeof rawA !== 'string' || typeof rawB !== 'string') continue
        if (isTerminalPaletteColor(rawA) || isTerminalPaletteColor(rawB)) {
          continue
        }
        const a = parseColor(rawA)
        const b = parseColor(rawB)
        if (!a || !b) continue

        const distance = perceptualDistance(a, b)
        if (distance < DISTINCTNESS_FLOOR) {
          issues.push({
            kind: 'indistinct',
            slots: [slotA, slotB],
            distance,
            why: group.why,
          })
        }
      }
    }
  }

  return { colors: out, issues }
}

/** Human-readable one-liner for an issue, for warnings and `/theme` output. */
export function describeIssue(issue: ThemeIssue): string {
  switch (issue.kind) {
    case 'unparseable':
      return `"${issue.slot}": ${JSON.stringify(issue.value)} is not a colour the terminal can render, so it would appear uncoloured. Use rgb(r,g,b), #rrggbb, ansi256(n) or ansi:<name>.`
    case 'repaired-contrast':
      return `"${issue.slot}": brightened from ${issue.from} to ${issue.to} (contrast ${issue.ratioBefore.toFixed(2)} to ${issue.ratioAfter.toFixed(2)}, floor ${issue.floor}) so it stays readable.`
    case 'unreadable':
      return `"${issue.slot}": ${issue.value} cannot reach the ${issue.floor}:1 floor against this theme's background (best ${issue.ratio.toFixed(2)}). Pick a lighter or darker colour.`
    case 'indistinct':
      return `"${issue.slots[0]}" and "${issue.slots[1]}" are nearly the same colour (distance ${issue.distance.toFixed(3)}) — ${issue.why}.`
  }
}
