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
  parseThemeFile,
  type ThemeFile,
  type ThemeWarning,
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
}

export type ThemeLoadResult = {
  themes: LoadedTheme[]
  warnings: ThemeWarning[]
}

export function getThemesDir(): string {
  return join(getClaudeConfigHomeDir(), 'themes')
}

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

/**
 * Loads and registers one theme from raw file text.
 *
 * Exported for tests and for the file watcher, which reloads a single file
 * rather than rescanning the directory.
 */
export function loadThemeFromText(
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

  const resolved = resolveThemeColors(parsed.theme)
  const { colors, issues } = validateThemeColors(resolved, parsed.theme.mode)

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
    mode: parsed.theme.mode,
    theme: colors as unknown as Theme,
  }
  if (parsed.theme.description !== undefined) {
    loaded.description = parsed.theme.description
  }
  if (parsed.theme.scene !== undefined) {
    loaded.scene = parsed.theme.scene
  }

  return { theme: loaded, warnings }
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
  const dir = getThemesDir()
  const warnings: ThemeWarning[] = []
  const themes: LoadedTheme[] = []

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch (error) {
    // Cleared on every exit path, so a fixed or deleted file stops being
    // reported the next time round.
    cachedWarnings = []
    if (isENOENT(error)) {
      // No themes directory is the normal case, not a problem.
      return { themes: [], warnings: [] }
    }
    logForDebugging(`[themes] Cannot read ${dir}: ${errorMessage(error)}`, {
      level: 'warn',
    })
    return { themes: [], warnings: [] }
  }

  // Keep the schema current so editors can complete slot names. Written on
  // every load rather than once, so it tracks slots added by an upgrade.
  void writeThemeJsonSchema(dir)

  const files = entries
    .filter(e => e.endsWith('.json') && e !== THEME_SCHEMA_FILENAME)
    .sort()

  for (const file of files) {
    const name = file.slice(0, -'.json'.length)
    let text: string
    try {
      text = await readFile(join(dir, file), 'utf-8')
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

    const { theme, warnings: fileWarnings } = loadThemeFromText(name, text)
    warnings.push(...fileWarnings)
    if (theme) {
      themes.push(theme)
    }
  }

  // Drop anything we registered before that has since gone away.
  const nowPresent = new Set(themes.map(t => t.name))
  for (const previous of registeredNames) {
    if (!nowPresent.has(previous)) {
      unregisterThemeWithTraits(previous)
    }
  }

  for (const t of themes) {
    registerThemeWithTraits(t.name, t.theme, t.mode, t.scene)
  }
  registeredNames = themes.map(t => t.name)

  if (themes.length > 0) {
    logForDebugging(
      `[themes] Loaded ${themes.length} user theme(s) from ${dir}`,
    )
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
