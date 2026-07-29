/**
 * Loads user-authored themes from ~/.claude/themes/*.json.
 *
 * Modelled on src/keybindings/loadUserBindings.ts, which is the closest
 * existing analogue (user JSON, merged with built-ins, hot-reloaded). The
 * conventions it establishes and this follows:
 *
 *  - **Never throw.** A malformed theme file degrades to "that one theme is
 *    unavailable", never to a broken CLI. Everything the author needs to know
 *    comes back as structured warnings.
 *  - **Three tiers.** Files that cannot be used at all are rejected with an
 *    error; individual bad fields are dropped with a warning while the rest of
 *    the theme still loads; missing optional data is silent.
 *  - **ENOENT is not a problem.** No themes directory just means no themes.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage, isENOENT } from '../utils/errors.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { jsonParse } from '../utils/slowOperations.js'
import type { SceneConfig } from '../scene/types.js'
import { getTheme, isReservedThemeName, type Theme } from '../utils/theme.js'
import {
  serializeThemeJsonSchema,
  THEME_SCHEMA_FILENAME,
} from './jsonSchema.js'
import {
  registerThemeWithTraits,
  unregisterThemeWithTraits,
} from './register.js'
import {
  findDuplicateSlotKeys,
  isOurThemeShape,
  parseThemeFile,
  type ThemeFile,
  type ThemeWarning,
  translateOfficialTheme,
} from './schema.js'
import { describeIssue, validateThemeColors } from './validate.js'

export type LoadedTheme = {
  name: string
  mode: 'dark' | 'light'
  description?: string
  /** Complete palette: authored slots over the mode's built-in, then repaired. */
  theme: Theme
  /** Animated background config; params complete (defaults filled by parse). */
  scene?: SceneConfig
  /** Which directory (or bundle) the theme came from. Drives delete/export policy and picker grouping. */
  origin: 'cc' | 'official' | 'bundled'
}

export type ThemeLoadResult = {
  themes: LoadedTheme[]
  warnings: ThemeWarning[]
}

/**
 * The directory OFFICIAL Claude Code reads for its custom themes. We scan it
 * read-only, importing official-format files; we never write here.
 */
export function getOfficialThemesDir(): string {
  return join(getClaudeConfigHomeDir(), 'themes')
}

/**
 * Our directory: everything this fork writes (generated themes, exports, the
 * editor-autocomplete schema) lives here, so official's picker never sees our
 * internals and vice versa. Created at startup by migrateLegacyThemes, which
 * also moves anything left in the older ~/.claude/cc-themes.
 */
export function getCctThemesDir(): string {
  return join(getClaudeConfigHomeDir(), CCT_THEMES_DIRNAME)
}

/** Directory name under ~/.claude. Shared with the migration. */
export const CCT_THEMES_DIRNAME = 'cct'

/** Where our themes used to live, before the rename to cct. */
export const LEGACY_CCT_THEMES_DIRNAME = 'cc-themes'

/**
 * Fills in every slot the author left out from the built-in theme for their
 * declared mode.
 *
 * This is what lets a theme file be ten lines long: set `claude` to your
 * favourite red and everything else stays coherent, because it comes from a
 * palette that was designed to hang together. It also means a generation that
 * only produces half the slots still yields a usable theme.
 */
export function resolveThemeColors(file: ThemeFile): Record<string, string> {
  const base = getTheme(file.mode) as unknown as Record<string, string>
  return { ...base, ...file.colors }
}

/** Resolve, validate and assemble a parsed ThemeFile into a LoadedTheme. */
function assembleLoadedTheme(
  name: string,
  parsed: ThemeFile,
  origin: LoadedTheme['origin'],
  warnings: ThemeWarning[],
): LoadedTheme {
  const resolved = resolveThemeColors(parsed)
  const { colors, issues } = validateThemeColors(resolved, parsed.mode)

  for (const issue of issues) {
    warnings.push({
      type: 'colour_issue',
      // Repairs are informational: the theme still works, it was just nudged.
      severity: issue.kind === 'repaired-contrast' ? 'warning' : 'error',
      theme: name,
      message: describeIssue(issue),
    })
  }

  const loaded: LoadedTheme = {
    name,
    mode: parsed.mode,
    theme: colors as unknown as Theme,
    origin,
  }
  if (parsed.description !== undefined) {
    loaded.description = parsed.description
  }
  if (parsed.scene !== undefined) {
    loaded.scene = parsed.scene
  }
  return loaded
}

export function loadThemeFromText(
  name: string,
  text: string,
  origin: LoadedTheme['origin'] = 'cc',
): { theme: LoadedTheme | null; warnings: ThemeWarning[] } {
  const warnings: ThemeWarning[] = []

  if (isReservedThemeName(name)) {
    warnings.push({
      type: 'reserved_name',
      severity: 'error',
      theme: name,
      message: `"${name}" is a built-in theme name and cannot be replaced.`,
      suggestion: `Rename the file to something else, for example "${name}-custom.json".`,
    })
    return { theme: null, warnings }
  }

  let raw: unknown
  try {
    raw = jsonParse(text)
  } catch (error) {
    warnings.push({
      type: 'parse_error',
      severity: 'error',
      theme: name,
      message: `Not valid JSON: ${errorMessage(error)}`,
    })
    return { theme: null, warnings }
  }

  warnings.push(...findDuplicateSlotKeys(text, name))

  const parsed = parseThemeFile(raw, name)
  warnings.push(...parsed.warnings)
  if (!parsed.ok) {
    return { theme: null, warnings }
  }

  return {
    theme: assembleLoadedTheme(name, parsed.theme, origin, warnings),
    warnings,
  }
}

/**
 * Loads a theme written in OFFICIAL Claude Code's format
 * ({ name, base, overrides }) from the shared ~/.claude/themes directory.
 *
 * Returns theme:null with NO warnings when the JSON is simply not
 * official-shaped — that directory is official's, and policing its contents
 * is not our job. Skips findDuplicateSlotKeys, whose regex targets a
 * `"colors"` block that official files do not have.
 */
export function loadOfficialThemeFromText(
  name: string,
  text: string,
): { theme: LoadedTheme | null; warnings: ThemeWarning[] } {
  const warnings: ThemeWarning[] = []

  if (isReservedThemeName(name)) {
    warnings.push({
      type: 'reserved_name',
      severity: 'error',
      theme: name,
      message: `"${name}" is a built-in theme name and cannot be replaced.`,
      suggestion: `Rename the file to something else, for example "${name}-custom.json".`,
    })
    return { theme: null, warnings }
  }

  let raw: unknown
  try {
    raw = jsonParse(text)
  } catch {
    return { theme: null, warnings }
  }

  const translated = translateOfficialTheme(raw)
  if (translated === null) {
    return { theme: null, warnings }
  }

  const parsed = parseThemeFile(translated, name)
  warnings.push(...parsed.warnings)
  if (!parsed.ok) {
    return { theme: null, warnings }
  }

  return {
    theme: assembleLoadedTheme(name, parsed.theme, 'official', warnings),
    warnings,
  }
}

/** Theme names this module has registered, so reloads can drop stale ones. */
let registeredNames: string[] = []

/**
 * Warnings from the last load, so the UI can show them.
 *
 * Without this a theme file that fails to parse simply never appears, and the
 * author has no way to find out why — the explanation exists but only reaches
 * the debug log. Mirrors getCachedKeybindingWarnings.
 */
let cachedWarnings: ThemeWarning[] = []

export function getCachedThemeWarnings(): ThemeWarning[] {
  return cachedWarnings
}

/**
 * Scans ~/.claude/themes, registers everything valid, and returns what was
 * found alongside anything worth telling the user.
 *
 * Safe to call repeatedly: themes registered by a previous call that no longer
 * exist are unregistered first, so a deleted file actually disappears.
 */
export async function loadUserThemes(): Promise<ThemeLoadResult> {
  const warnings: ThemeWarning[] = []
  // Name-keyed so a cc theme shadows a same-named official one with a single
  // picker entry, not a duplicate. Official is scanned first; cc overwrites.
  const byName = new Map<string, LoadedTheme>()

  // ── The shared official directory: read-only import ──
  const officialDir = getOfficialThemesDir()
  let officialEntries: string[] = []
  try {
    officialEntries = await readdir(officialDir)
  } catch (error) {
    if (!isENOENT(error)) {
      logForDebugging(
        `[themes] Cannot read ${officialDir}: ${errorMessage(error)}`,
        { level: 'warn' },
      )
    }
  }
  for (const file of officialEntries
    .filter(e => e.endsWith('.json') && e !== THEME_SCHEMA_FILENAME)
    .sort()) {
    const name = file.slice(0, -'.json'.length)
    let text: string
    try {
      text = await readFile(join(officialDir, file), 'utf-8')
    } catch {
      continue
    }

    let raw: unknown
    try {
      raw = jsonParse(text)
    } catch {
      // Not valid JSON — official's directory, not ours to police.
      continue
    }

    if (isOurThemeShape(raw)) {
      // A stray of OURS the migration could not move (collision, read-only
      // fs). Load it in place; origin is the directory it lives in, so the
      // delete-refusal message stays literally true.
      logForDebugging(
        `[themes] ${file} in ${officialDir} is a cct theme file — it belongs in ${getCctThemesDir()}`,
      )
      const { theme, warnings: w } = loadThemeFromText(name, text, 'official')
      warnings.push(...w)
      if (theme) byName.set(theme.name, theme)
      continue
    }

    const { theme, warnings: w } = loadOfficialThemeFromText(name, text)
    warnings.push(...w)
    if (theme) byName.set(theme.name, theme)
  }

  // ── Our directory ──
  const ccDir = getCctThemesDir()
  let ccEntries: string[] | null = null
  try {
    ccEntries = await readdir(ccDir)
  } catch (error) {
    if (!isENOENT(error)) {
      logForDebugging(`[themes] Cannot read ${ccDir}: ${errorMessage(error)}`, {
        level: 'warn',
      })
    }
  }
  if (ccEntries !== null) {
    // Keep the schema current so editors can complete slot names. Written on
    // every load rather than once, so it tracks slots added by an upgrade —
    // and only ever into OUR directory.
    void writeThemeJsonSchema(ccDir)

    for (const file of ccEntries
      .filter(e => e.endsWith('.json') && e !== THEME_SCHEMA_FILENAME)
      .sort()) {
      const name = file.slice(0, -'.json'.length)
      let text: string
      try {
        text = await readFile(join(ccDir, file), 'utf-8')
      } catch (error) {
        if (!isENOENT(error)) {
          warnings.push({
            type: 'parse_error',
            severity: 'error',
            theme: name,
            message: `Could not read ${file}: ${errorMessage(error)}`,
          })
        }
        continue
      }

      const { theme, warnings: fileWarnings } = loadThemeFromText(
        name,
        text,
        'cc',
      )
      warnings.push(...fileWarnings)
      if (theme) {
        if (byName.has(theme.name)) {
          logForDebugging(
            `[themes] ${theme.name} in ${ccDir} shadows the copy in ${officialDir}`,
          )
        }
        byName.set(theme.name, theme)
      }
    }
  }

  const themes = [...byName.values()]

  // Drop anything we registered before that has since gone away.
  for (const previous of registeredNames) {
    if (!byName.has(previous)) {
      unregisterThemeWithTraits(previous)
    }
  }

  for (const t of themes) {
    registerThemeWithTraits(t.name, t.theme, t.mode, t.scene, {
      origin: t.origin,
      description: t.description,
    })
  }
  registeredNames = themes.map(t => t.name)

  if (themes.length > 0) {
    logForDebugging(`[themes] Loaded ${themes.length} user theme(s)`)
  }

  cachedWarnings = warnings
  return { themes, warnings }
}

/**
 * Drops a JSON Schema next to the theme files.
 *
 * Best effort — a read-only or full disk should cost you editor completion,
 * not your themes, so failures are swallowed rather than reported.
 */
async function writeThemeJsonSchema(dir: string): Promise<void> {
  try {
    await writeFile(
      join(dir, THEME_SCHEMA_FILENAME),
      serializeThemeJsonSchema(),
      'utf-8',
    )
  } catch {
    // Not worth telling the user about.
  }
}

/** Test seam: forget what has been registered without touching the registry. */
export function resetLoadedThemeTracking(): void {
  registeredNames = []
}
