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
import {
  PETALS_CLAMPS,
  type PetalsParams,
  RAIN_CLAMPS,
  type RainParams,
  type SceneConfig,
} from '../scene/types.js'
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
   * The animated background: a primitive NAME plus bounded NUMBERS, never
   * code — that is what keeps theme files safe to share. Params are optional
   * in the file; parsing fills defaults and clamps out-of-range values with
   * a warning, so downstream always sees a complete, sane config.
   *
   * Parsed unconditionally (it is inert data); whether anything ANIMATES is
   * gated at the activation point behind feature('SCENE_LAYER'), the same
   * split AUTO_THEME uses ('auto' is always a valid stored value — the flag
   * gates the watcher and picker option, not the config format).
   */
  scene?: SceneConfig
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
    scene: z
      .union([
        z.object({ kind: z.literal('none') }),
        z.object({
          kind: z.literal('rain'),
          params: z.record(z.string(), z.number()).optional(),
        }),
        z.object({
          kind: z.literal('petals'),
          params: z.record(z.string(), z.number()).optional(),
        }),
      ])
      .optional(),
  }),
)

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * True when parsed JSON is a theme in OUR format — the minimum bar
 * parseThemeFile itself requires (valid mode + a colors object). Used by the
 * migration to decide which files in the shared ~/.claude/themes directory
 * are ours to move, so it must not be looser than the parser.
 */
export function isOurThemeShape(raw: unknown): boolean {
  return (
    isPlainObject(raw) &&
    (raw.mode === 'dark' || raw.mode === 'light') &&
    isPlainObject(raw.colors)
  )
}

/**
 * Translates a theme in OFFICIAL Claude Code's custom-theme format —
 * `{ name, base: 'dark'|'light', overrides: {slot: colour} }`, verified
 * against real files official's own picker accepts — into our shape, or
 * returns null when the JSON is not official-shaped.
 *
 * The `name` field is deliberately ignored: in this fork the filename is the
 * theme name, and honouring an embedded name would reintroduce the exact
 * file-disagrees-with-itself confusion that convention exists to prevent.
 */
export function translateOfficialTheme(
  raw: unknown,
): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null
  if (raw.base !== 'dark' && raw.base !== 'light') return null
  if (!isPlainObject(raw.overrides)) return null
  return { mode: raw.base, colors: raw.overrides }
}

type ClampTable = Record<string, { default: number; min: number; max: number }>

/**
 * Resolves a scene's params against its clamp table: missing → default,
 * non-numeric → default + warning, out of range → clamped + warning, unknown
 * → dropped + warning. The theme always loads; only the value bends.
 */
function clampSceneParams(
  raw: unknown,
  clamps: ClampTable,
  kind: string,
  themeName: string,
  warnings: ThemeWarning[],
): Record<string, number> {
  const out: Record<string, number> = {}
  const source = isPlainObject(raw) ? raw : {}

  for (const [key, spec] of Object.entries(clamps)) {
    const value = source[key]
    if (value === undefined) {
      out[key] = spec.default
      continue
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      warnings.push({
        type: 'invalid_field',
        severity: 'warning',
        theme: themeName,
        message: `Scene param "${kind}.${key}" must be a number; using the default (${spec.default}).`,
      })
      out[key] = spec.default
      continue
    }
    if (value < spec.min || value > spec.max) {
      const clamped = Math.min(spec.max, Math.max(spec.min, value))
      warnings.push({
        type: 'invalid_field',
        severity: 'warning',
        theme: themeName,
        message: `Scene param "${kind}.${key}" is out of range [${spec.min}–${spec.max}]; clamped ${value} to ${clamped}.`,
      })
      out[key] = clamped
      continue
    }
    out[key] = value
  }

  for (const key of Object.keys(source)) {
    if (!(key in clamps)) {
      warnings.push({
        type: 'invalid_field',
        severity: 'warning',
        theme: themeName,
        message: `Unknown scene param "${kind}.${key}". Ignoring it.`,
      })
    }
  }

  return out
}

/**
 * Parses the optional `scene` field. Unknown kinds warn and yield undefined
 * (forward compatibility: a theme written for a newer build still loads, just
 * without its animation).
 */
function parseSceneConfig(
  raw: unknown,
  themeName: string,
  warnings: ThemeWarning[],
): SceneConfig | undefined {
  if (raw === undefined) return undefined
  if (!isPlainObject(raw)) {
    warnings.push({
      type: 'invalid_field',
      severity: 'warning',
      theme: themeName,
      message:
        '"scene" must be an object like { "kind": "rain" }. Ignoring it.',
    })
    return undefined
  }

  switch (raw.kind) {
    case 'none':
      return { kind: 'none' }
    case 'rain':
      // clampSceneParams emits exactly the clamp table's keys, so the
      // record is a complete RainParams by construction.
      return {
        kind: 'rain',
        params: clampSceneParams(
          raw.params,
          RAIN_CLAMPS,
          'rain',
          themeName,
          warnings,
        ) as unknown as RainParams,
      }
    case 'petals':
      return {
        kind: 'petals',
        params: clampSceneParams(
          raw.params,
          PETALS_CLAMPS,
          'petals',
          themeName,
          warnings,
        ) as unknown as PetalsParams,
      }
    default:
      warnings.push({
        type: 'invalid_field',
        severity: 'warning',
        theme: themeName,
        message: `Unsupported scene kind ${JSON.stringify(raw.kind)}. Ignoring it.`,
        suggestion: 'Available scenes: "none", "rain", "petals".',
      })
      return undefined
  }
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

  const scene = parseSceneConfig(raw.scene, themeName, warnings)
  if (scene !== undefined) {
    theme.scene = scene
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
