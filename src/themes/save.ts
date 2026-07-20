/**
 * Writes a generated theme to ~/.claude/themes so it survives a restart.
 *
 * The file written is an ordinary theme file — the same thing a user would
 * hand write, and the same thing the loader reads on the next launch. Nothing
 * about a generated theme is special once it is on disk, which is what makes
 * "generate it, then tweak one colour" work.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getSceneConfig } from '../scene/registry.js'
import type { SceneConfig } from '../scene/types.js'
import { isKnownTheme, isReservedThemeName } from '../utils/theme.js'
import { THEME_SCHEMA_REF } from './jsonSchema.js'
import { getCcThemesDir } from './loader.js'

export type SaveResult =
  | { ok: true; name: string; path: string }
  | { ok: false; error: string }

/**
 * Finds a name that is free, appending -2, -3 … if needed.
 *
 * Overwriting silently would be the worst outcome: a user who generates two
 * "spiderman" themes should end up with both, not discover the first was
 * destroyed. Bounded so a pathological registry cannot spin forever.
 */
export function findAvailableThemeName(preferred: string): string {
  if (!isReservedThemeName(preferred) && !isKnownTheme(preferred)) {
    return preferred
  }
  for (let i = 2; i < 100; i++) {
    const candidate = `${preferred}-${i}`
    if (!isReservedThemeName(candidate) && !isKnownTheme(candidate)) {
      return candidate
    }
  }
  return `${preferred}-${Date.now()}`
}

/**
 * Serialises a theme in the documented file format.
 *
 * Slots are written in the order the palette supplies them, which for a
 * generated theme is the model's own grouping — it tends to keep related
 * colours together, and preserving that makes the file pleasant to edit.
 */
export function serializeThemeFile(theme: {
  mode: 'dark' | 'light'
  description?: string
  colors: Record<string, string>
  scene?: SceneConfig
}): string {
  // Points at the schema written alongside the theme files, so opening a
  // generated theme in an editor gives completion and hover docs for every
  // slot. First key so it is the first thing an editor reads.
  const body: Record<string, unknown> = { $schema: THEME_SCHEMA_REF }
  body.mode = theme.mode
  if (theme.description) {
    body.description = theme.description
  }
  // The theme's actual scene, not a hardcoded 'none' — /theme export must
  // carry a theme's animation along with its colours.
  body.scene = theme.scene ?? { kind: 'none' }
  body.colors = theme.colors

  return `${JSON.stringify(body, null, 2)}\n`
}

/**
 * Writes an editable copy of an existing theme.
 *
 * The fastest way to learn the file format is to see a complete, working
 * example with your own editor completing the slot names — which is what this
 * produces. Copying a built-in is also the natural way to make a small tweak
 * to one, since built-in names themselves are reserved.
 */
export async function exportTheme(
  sourceName: string,
  mode: 'dark' | 'light',
  colors: Record<string, string>,
): Promise<SaveResult> {
  const name = findAvailableThemeName(`${sourceName}-copy`)
  return saveGeneratedTheme(name, {
    mode,
    description: `Copied from ${sourceName}`,
    colors,
    scene: getSceneConfig(sourceName),
  })
}

/**
 * Deletes a theme file.
 *
 * Only touches ~/.claude/themes; built-in themes have no file and are refused
 * before we get here.
 */
export async function deleteThemeFile(name: string): Promise<SaveResult> {
  const path = join(getCcThemesDir(), `${name}.json`)
  try {
    await rm(path)
    return { ok: true, name, path }
  } catch (error) {
    return {
      ok: false,
      error: `Could not delete ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  }
}

export async function saveGeneratedTheme(
  name: string,
  theme: {
    mode: 'dark' | 'light'
    description?: string
    colors: Record<string, string>
    scene?: SceneConfig
  },
): Promise<SaveResult> {
  const dir = getCcThemesDir()
  const path = join(dir, `${name}.json`)

  try {
    await mkdir(dir, { recursive: true })
    await writeFile(path, serializeThemeFile(theme), 'utf-8')
    return { ok: true, name, path }
  } catch (error) {
    return {
      ok: false,
      error: `Could not write ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  }
}
