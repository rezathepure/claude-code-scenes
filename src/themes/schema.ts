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

import { isDrawableChar, validateFrames } from '../scene/frames.js'
import {
  FIELD_PARAMS,
  MAX_FIELDS,
  MAX_SHADERS,
  MAX_SPRITES,
  type ParamTable,
  SCENE_COLOR_SLOTS,
  SCENE_PARAMS,
  SHADER_PARAMS,
  SPRITE_PARAMS,
} from '../scene/grammar.js'
import {
  type FieldLayer,
  PETALS_CLAMPS,
  type PetalsParams,
  RAIN_CLAMPS,
  type RainParams,
  type SceneConfig,
  type ShaderLayer,
  type SpriteLayer,
} from '../scene/types.js'
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
   * The animated background: either a legacy preset name, or composed layers
   * — particle fields, drawn sprites, expression shaders. Names and bounded
   * numbers throughout, so a theme file is never executed as code. Params are
   * optional in the file; parsing fills defaults, clamps out-of-range values
   * and drops unsalvageable layers with a warning, so downstream always sees
   * a complete, sane config.
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

/*
 * There was a zod `ThemeFileSchema` here, described as the source for the
 * editor-autocomplete JSON Schema. It never was: jsonSchema.ts hand-builds
 * that from the clamp tables, and this mirror had zero importers while
 * carrying a third redundant copy of the scene shape. Removed rather than
 * updated — a fourth place to keep in sync is worse than none.
 */

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

/**
 * Resolves one layer's parameters against its table: missing → default,
 * wrong type → default + warning, out of range → clamped + warning, unknown
 * → dropped + warning. The theme always loads; only the value bends.
 *
 * Returns null when the layer cannot be salvaged — a sprite whose art is
 * malformed, or a shader with no expression. Those are dropped whole, because
 * a half-valid sprite paints debris and debris is worse than nothing.
 *
 * The `number` branch's warning strings are load-bearing: they are what the
 * loader tests assert, and they were written before this function was
 * generic. Keep them byte-identical.
 */
export function coerceParams(
  raw: unknown,
  table: ParamTable,
  path: string,
  themeName: string,
  warnings: ThemeWarning[],
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {}
  const source = isPlainObject(raw) ? raw : {}

  const warn = (message: string, suggestion?: string): void => {
    warnings.push({
      type: 'invalid_field',
      severity: 'warning',
      theme: themeName,
      message,
      ...(suggestion !== undefined ? { suggestion } : {}),
    })
  }

  for (const [key, spec] of Object.entries(table)) {
    const value = source[key]
    const label = `"${path}.${key}"`

    switch (spec.type) {
      case 'number':
      case 'int': {
        if (value === undefined) {
          out[key] = spec.default
          break
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          warn(
            `Scene param ${label} must be a number; using the default (${spec.default}).`,
          )
          out[key] = spec.default
          break
        }
        if (value < spec.min || value > spec.max) {
          const clamped = Math.min(spec.max, Math.max(spec.min, value))
          warn(
            `Scene param ${label} is out of range [${spec.min}–${spec.max}]; clamped ${value} to ${clamped}.`,
          )
          out[key] = spec.type === 'int' ? Math.round(clamped) : clamped
          break
        }
        out[key] = spec.type === 'int' ? Math.round(value) : value
        break
      }

      case 'enum': {
        if (value === undefined) {
          out[key] = spec.default
          break
        }
        if (typeof value !== 'string' || !spec.values.includes(value)) {
          warn(
            `Scene param ${label} is not one of the available values; using the default (${spec.default}).`,
            `Available: ${spec.values.join(', ')}.`,
          )
          out[key] = spec.default
          break
        }
        out[key] = value
        break
      }

      case 'slot': {
        if (value === undefined) {
          out[key] = spec.default
          break
        }
        if (typeof value !== 'string' || !SCENE_COLOR_SLOTS.includes(value)) {
          warn(
            `Scene param ${label} must be a colour slot a scene can derive from; using the default (${spec.default}).`,
            `Available: ${SCENE_COLOR_SLOTS.join(', ')}.`,
          )
          out[key] = spec.default
          break
        }
        out[key] = value
        break
      }

      case 'char': {
        if (value === undefined || value === '') {
          out[key] = spec.default
          break
        }
        if (typeof value !== 'string' || !isDrawableChar(value)) {
          warn(
            `Scene param ${label} must be a single drawable character; ignoring it.`,
          )
          out[key] = spec.default
          break
        }
        out[key] = value
        break
      }

      case 'text': {
        if (value === undefined) {
          out[key] = spec.default
          break
        }
        if (typeof value !== 'string') {
          warn(`Scene param ${label} must be text; ignoring it.`)
          out[key] = spec.default
          break
        }
        // Anything unprintable would corrupt the line it is rendered on.
        const cleaned = value.replace(/[^\x20-\x7e]/g, '').trim()
        if (cleaned.length > spec.maxCols) {
          warn(
            `Scene param ${label} is longer than ${spec.maxCols} characters; shortened.`,
          )
        }
        out[key] = cleaned.slice(0, spec.maxCols)
        break
      }

      case 'expr': {
        if (typeof value !== 'string' || value.trim() === '') {
          warn(
            `Scene param ${label} must be an expression. Dropping the layer.`,
          )
          return null
        }
        if (value.length > spec.maxLength) {
          warn(
            `Scene param ${label} is longer than ${spec.maxLength} characters. Dropping the layer.`,
          )
          return null
        }
        out[key] = value
        break
      }

      case 'frames': {
        const outcome = validateFrames(value, spec)
        if (!outcome.ok) {
          warn(`Scene param ${label} ${outcome.error}. Dropping the sprite.`)
          return null
        }
        out[key] = outcome.value
        break
      }
    }
  }

  for (const key of Object.keys(source)) {
    if (!Object.hasOwn(table, key)) {
      warn(`Unknown scene param "${path}.${key}". Ignoring it.`)
    }
  }

  return out
}

/**
 * The legacy presets' typed view of coerceParams. Their tables cover every
 * key of RainParams/PetalsParams by construction, and neither can fail, so
 * the record is complete and the cast is sound.
 */
function clampSceneParams(
  raw: unknown,
  clamps: ParamTable,
  kind: string,
  themeName: string,
  warnings: ThemeWarning[],
): Record<string, number> {
  return (coerceParams(raw, clamps, kind, themeName, warnings) ?? {}) as Record<
    string,
    number
  >
}

/**
 * Turns a parsed scene back into the shape a theme file holds.
 *
 * Parsing does not round-trip by itself: a sprite's `frames` becomes a
 * validated `{frames, width, height}` in memory, and writing that object
 * straight out would produce a file that no longer loads. `/theme export`
 * reads from the runtime registry, so this is what stands between a shared
 * theme and a broken one.
 *
 * Writing back the REPAIRED config is deliberate — layers that were dropped
 * on load stay dropped, out-of-range numbers stay clamped. Exporting a theme
 * should give you a file that loads without complaint, which is the same
 * repair-don't-reject discipline the colour validator follows.
 */
export function serializeSceneConfig(scene: SceneConfig): unknown {
  if (scene.kind !== 'custom') return scene
  const { label, fields, sprites, shaders } = scene.scene
  const out: Record<string, unknown> = { kind: 'custom' }
  if (label !== '') out.label = label
  if (fields.length > 0) out.fields = fields
  if (sprites.length > 0) {
    out.sprites = sprites.map(s => ({
      ...s,
      // Back to the array-of-rows the file format uses.
      frames: s.frames.frames,
    }))
  }
  if (shaders.length > 0) out.shaders = shaders
  return out
}

/**
 * Parses one array of layers, dropping the ones that cannot be salvaged.
 *
 * Excess layers are trimmed rather than rejected: a scene with five fields is
 * a scene the model got slightly carried away with, not a broken file.
 */
function parseLayers(
  raw: unknown,
  table: ParamTable,
  pathBase: string,
  max: number,
  themeName: string,
  warnings: ThemeWarning[],
): Record<string, unknown>[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push({
      type: 'invalid_field',
      severity: 'warning',
      theme: themeName,
      message: `"${pathBase}" must be an array. Ignoring it.`,
    })
    return []
  }
  if (raw.length > max) {
    warnings.push({
      type: 'invalid_field',
      severity: 'warning',
      theme: themeName,
      message: `"${pathBase}" has ${raw.length} layers; only the first ${max} are used.`,
    })
  }

  const out: Record<string, unknown>[] = []
  for (let i = 0; i < Math.min(raw.length, max); i++) {
    const layer = coerceParams(
      raw[i],
      table,
      `${pathBase}[${i}]`,
      themeName,
      warnings,
    )
    if (layer !== null) out.push(layer)
  }
  return out
}

/**
 * Parses the optional `scene` field. Unknown kinds warn and yield undefined
 * (forward compatibility: a theme written for a newer build still loads, just
 * without its animation).
 *
 * Layers win over `kind`. A model that fills in `fields` and leaves `kind` at
 * "rain" meant the fields — and asking it to keep a redundant discriminator
 * in step with the rest of its answer is asking for a bug report rather than
 * a theme.
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

  const fields = parseLayers(
    raw.fields,
    FIELD_PARAMS,
    'scene.fields',
    MAX_FIELDS,
    themeName,
    warnings,
  ) as unknown as FieldLayer[]

  const sprites = parseLayers(
    raw.sprites,
    SPRITE_PARAMS,
    'scene.sprites',
    MAX_SPRITES,
    themeName,
    warnings,
  ) as unknown as SpriteLayer[]

  const shaders = parseLayers(
    raw.shaders,
    SHADER_PARAMS,
    'scene.shaders',
    MAX_SHADERS,
    themeName,
    warnings,
  ) as unknown as ShaderLayer[]

  if (fields.length > 0 || sprites.length > 0 || shaders.length > 0) {
    if (raw.kind !== undefined && raw.kind !== 'custom') {
      warnings.push({
        type: 'invalid_field',
        severity: 'warning',
        theme: themeName,
        message: `"scene" declares kind ${JSON.stringify(raw.kind)} but also has layers; the layers win.`,
      })
    }
    const meta = coerceParams(
      { label: raw.label },
      SCENE_PARAMS,
      'scene',
      themeName,
      warnings,
    )
    return {
      kind: 'custom',
      scene: {
        label: (meta?.label as string) ?? '',
        fields,
        sprites,
        shaders,
      },
    }
  }

  if (raw.kind === 'custom') {
    warnings.push({
      type: 'invalid_field',
      severity: 'warning',
      theme: themeName,
      message: 'A custom scene needs at least one layer. Ignoring it.',
      suggestion: 'Add a "fields", "sprites" or "shaders" array.',
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
