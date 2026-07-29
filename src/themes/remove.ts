/**
 * Deleting a theme, and deciding whether it may be deleted at all.
 *
 * The policy lived inside the `/theme delete` command handler, which was fine
 * while that was the only way to remove a theme. The grid now has a delete
 * key, and two copies of "can this be deleted" would drift — the grid would
 * happily offer to delete something the command refuses.
 *
 * Only the six built-ins are undeletable, and for a concrete reason: they
 * have no file and no registry entry of ours: they are the palettes ink falls
 * back to, so "removing" one would leave the app with nothing to render. The
 * other three origins all resolve to something we can actually act on:
 *
 * - `cc`       — our own file in ~/.claude/cct. Removed.
 * - `official` — a real file in ~/.claude/themes. Also removed; refusing only
 *                meant the user had to go and do it by hand.
 * - `bundled`  — inside the binary, so there is nothing to unlink. The name is
 *                recorded in `hiddenThemes` instead and registerBundledThemes
 *                skips it, which is what makes the deletion survive a restart.
 *                `/theme restore <name>` puts it back.
 */

import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import { isKnownTheme, isReservedThemeName } from '../utils/theme.js'
import { getOfficialThemesDir } from './loader.js'
import { getThemeOrigin } from './meta.js'
import { unregisterThemeWithTraits } from './register.js'
import { deleteThemeFile } from './save.js'

export type DeleteEligibility =
  | { deletable: true }
  | { deletable: false; reason: string }

/**
 * Whether a theme can be deleted, and if not, what to tell the user.
 *
 * Pure and synchronous so the UI can call it while rendering — the grid needs
 * to know before it offers a confirmation, not after.
 */
export function canDeleteTheme(name: string): DeleteEligibility {
  if (isReservedThemeName(name)) {
    return {
      deletable: false,
      reason: `“${name}” is one of the built-in palettes and has no file to remove.`,
    }
  }
  if (!isKnownTheme(name)) {
    return { deletable: false, reason: `No theme called “${name}”.` }
  }
  return { deletable: true }
}

export type DeleteOutcome =
  | { ok: true; message: string }
  | { ok: false; message: string }

/** Records a bundled theme as deleted, since there is no file to unlink. */
async function hideBundledTheme(name: string): Promise<void> {
  if ((getGlobalConfig().hiddenThemes ?? []).includes(name)) return
  saveGlobalConfig(current => ({
    ...current,
    hiddenThemes: [...(current.hiddenThemes ?? []), name],
  }))
}

/** Undoes hideBundledTheme. Returns false if the theme was not hidden. */
export function restoreTheme(name: string): boolean {
  if (!(getGlobalConfig().hiddenThemes ?? []).includes(name)) return false
  saveGlobalConfig(current => ({
    ...current,
    hiddenThemes: (current.hiddenThemes ?? []).filter(n => n !== name),
  }))
  return true
}

/** Every bundled theme the user has deleted. */
export function hiddenThemeNames(): string[] {
  return [...(getGlobalConfig().hiddenThemes ?? [])]
}

/**
 * Removes a theme and unregisters it.
 *
 * Unregistering only on success is deliberate: a theme whose file could not
 * be removed is still on disk and will be back on the next load, so dropping
 * it from the registry would just make the picker lie until restart.
 */
export async function removeTheme(name: string): Promise<DeleteOutcome> {
  const eligibility = canDeleteTheme(name)
  if (!eligibility.deletable) {
    return { ok: false, message: eligibility.reason }
  }

  const origin = getThemeOrigin(name)

  if (origin === 'bundled') {
    await hideBundledTheme(name)
    unregisterThemeWithTraits(name)
    return {
      ok: true,
      message: `Removed “${name}”. It ships with cct, so run /theme restore ${name} to bring it back.`,
    }
  }

  const result = await deleteThemeFile(
    name,
    origin === 'official' ? getOfficialThemesDir() : undefined,
  )
  if (!result.ok) {
    return { ok: false, message: result.error }
  }

  unregisterThemeWithTraits(name)
  return { ok: true, message: `Deleted “${name}”.` }
}
