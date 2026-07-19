/**
 * The shape of a user-authored theme file.
 *
 * Files live at ~/.claude/themes/<name>.json, and the *filename* is the theme
 * name — there is no `name` field. That removes a whole class of confusion
 * where a file called `matrix.json` declares `"name": "sakura"` and the user
 * cannot work out which one `/theme` is listing. Skills resolve names the same
 * way (the directory name wins).
 *
 * Every field except `mode` and `colors` is optional, and `colors` may specify
 * as few slots as it likes — anything absent is filled from the built-in theme
 * for the declared mode. A ten-line file is a valid theme.
 */

import { z } from 'zod/v4'
import { lazySchema } from '../utils/lazySchema.js'
import { getTheme } from '../utils/theme.js'

export type ThemeMode = 'dark' | 'light'

/** A theme file after parsing, before slot-filling or validation. */
export type ThemeFile = {
  /** Whether the palette is designed for a dark or light terminal. */
  mode: ThemeMode
  /** Colour slots. Partial; missing entries come from the mode's built-in. */
  colors: Record<string, string>
  /** Shown next to the theme in the picker. */
  description?: string
  author?: string
  /**
   * Reserved for the animated background layer.
   *
   * Declared now, always `none` for the moment, so that theme files written
   * today do not need migrating when scene primitives arrive. The model will
   * only ever choose from a fixed set of named primitives and fill in their
   * parameters — it never emits code, which is what keeps theme files safe to
   * share.
   */
  scene?: { kind: 'none' }
}

export type ThemeWarningType =
  | 'parse_error'
  | 'reserved_name'
  | 'invalid_field'
  | 'unknown_slot'
  | 'duplicate_key'
  | 'colour_issue'

/** A problem with a theme file, reported rather than thrown. */
export type ThemeWarning = {
  type: ThemeWarningType
  severity: 'error' | 'warning'
  /** Theme name (filename stem) the warning belongs to. */
  theme: string
  message: string
  suggestion?: string
}

/** Every slot name a theme may set, taken from the shipped palette. */
export function getKnownSlotNames(): string[] {
  return Object.keys(getTheme('dark'))
}

/**
 * Zod schema, used to emit a JSON Schema for editor autocomplete via the
 * `$schema` key — not on the load path, which uses the hand-rolled guards
 * below. This mirrors how keybindings.json is handled: zod for tooling,
 * explicit guards for loading, so a schema change can never make a user's
 * existing theme stop loading.
 */
export const ThemeFileSchema = lazySchema(() =>
  z.object({
    $schema: z.string().optional(),
    mode: z.enum(['dark', 'light']),
    description: z.string().optional(),
    author: z.string().optional(),
    colors: z.record(z.string(), z.string()),
    scene: z.object({ kind: z.literal('none') }).optional(),
  }),
)

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export type ParseOutcome =
  | { ok: true; theme: ThemeFile; warnings: ThemeWarning[] }
  | { ok: false; warnings: ThemeWarning[] }

/**
 * Turns parsed JSON into a ThemeFile, or explains why it cannot.
 *
 * Follows the three-tier convention used by agent and skill loading:
 * unusable files are rejected with an error, individual bad fields are
 * dropped with a warning while the rest of the theme still loads, and
 * nothing ever throws.
 */
export function parseThemeFile(raw: unknown, themeName: string): ParseOutcome {
  const warnings: ThemeWarning[] = []
  const err = (message: string, suggestion?: string): ParseOutcome => {
    warnings.push({
      type: 'parse_error',
      severity: 'error',
      theme: themeName,
      message,
      suggestion,
    })
    return { ok: false, warnings }
  }

  if (!isPlainObject(raw)) {
    return err(
      'Theme file must contain a JSON object.',
      'Use { "mode": "dark", "colors": { ... } }',
    )
  }

  if (raw.mode !== 'dark' && raw.mode !== 'light') {
    return err(
      `"mode" must be "dark" or "light" (got ${JSON.stringify(raw.mode)}).`,
      'Set the terminal background this theme is designed for. It decides which built-in fills the slots you leave out, and which background readability is checked against.',
    )
  }

  if (!isPlainObject(raw.colors)) {
    return err(
      '"colors" must be an object mapping slot names to colour values.',
      'Use "colors": { "text": "rgb(200,245,205)" }',
    )
  }

  // Drop bad individual entries rather than failing the whole theme.
  const known = new Set(getKnownSlotNames())
  const colors: Record<string, string> = {}
  for (const [slot, value] of Object.entries(raw.colors)) {
    if (typeof value !== 'string') {
      warnings.push({
        type: 'invalid_field',
        severity: 'warning',
        theme: themeName,
        message: `Slot "${slot}" must be a string, not ${typeof value}. Ignoring it.`,
      })
      continue
    }
    if (!known.has(slot)) {
      warnings.push({
        type: 'unknown_slot',
        severity: 'warning',
        theme: themeName,
        message: `Unknown slot "${slot}". Ignoring it.`,
        suggestion: 'It may be a typo, or from a newer version of Claude Code.',
      })
      continue
    }
    colors[slot] = value
  }

  const theme: ThemeFile = { mode: raw.mode, colors }

  if (typeof raw.description === 'string') {
    theme.description = raw.description
  } else if (raw.description !== undefined) {
    warnings.push({
      type: 'invalid_field',
      severity: 'warning',
      theme: themeName,
      message: '"description" must be a string. Ignoring it.',
    })
  }

  if (typeof raw.author === 'string') {
    theme.author = raw.author
  }

  if (isPlainObject(raw.scene)) {
    if (raw.scene.kind === 'none') {
      theme.scene = { kind: 'none' }
    } else {
      warnings.push({
        type: 'invalid_field',
        severity: 'warning',
        theme: themeName,
        message: `Unsupported scene kind ${JSON.stringify(raw.scene.kind)}. Ignoring it.`,
        suggestion:
          'Animated scenes are not implemented yet; only { "kind": "none" } is accepted.',
      })
    }
  }

  return { ok: true, theme, warnings }
}

/**
 * Flags slots written more than once in the same `colors` object.
 *
 * JSON.parse keeps the last value and discards the rest without complaint, so
 * a user who edits the first occurrence sees nothing change and has no way to
 * tell why. Scans the raw text because by parse time the evidence is gone.
 */
export function findDuplicateSlotKeys(
  jsonText: string,
  themeName: string,
): ThemeWarning[] {
  const colorsBlock = /"colors"\s*:\s*\{([^{}]*)\}/.exec(jsonText)
  if (!colorsBlock?.[1]) {
    return []
  }

  const seen = new Set<string>()
  const duplicated = new Set<string>()
  for (const m of colorsBlock[1].matchAll(/"([^"]+)"\s*:/g)) {
    const key = m[1]!
    if (seen.has(key)) {
      duplicated.add(key)
    }
    seen.add(key)
  }

  return [...duplicated].map(key => ({
    type: 'duplicate_key' as const,
    severity: 'warning' as const,
    theme: themeName,
    message: `Slot "${key}" is set more than once; only the last value is used.`,
    suggestion: 'Remove the earlier entries to avoid confusion.',
  }))
}
