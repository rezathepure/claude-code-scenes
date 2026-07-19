/**
 * Writes a generated theme to ~/.claude/themes so it survives a restart.
 *
 * The file written is an ordinary theme file — the same thing a user would
 * hand write, and the same thing the loader reads on the next launch. Nothing
 * about a generated theme is special once it is on disk, which is what makes
 * "generate it, then tweak one colour" work.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isKnownTheme, isReservedThemeName } from '../utils/theme.js'
import { getThemesDir } from './loader.js'

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
}): string {
  const body: Record<string, unknown> = { mode: theme.mode }
  if (theme.description) {
    body.description = theme.description
  }
  body.scene = { kind: 'none' }
  body.colors = theme.colors

  return `${JSON.stringify(body, null, 2)}\n`
}

export async function saveGeneratedTheme(
  name: string,
  theme: {
    mode: 'dark' | 'light'
    description?: string
    colors: Record<string, string>
  },
): Promise<SaveResult> {
  const dir = getThemesDir()
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
