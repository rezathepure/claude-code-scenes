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
 * back to, so "removing" one would leave the app with nothing to render.
 * Everything else resolves to a file we can actually unlink:
 *
 * - `cc`       — our own file in ~/.claude/cct. Removed. Starter themes are
 *                seeded into that directory too, so they are this case as
 *                well; the seed record is what stops one reappearing on the
 *                next launch, and `/theme restore <name>` writes it back.
 * - `official` — a real file in ~/.claude/themes. Also removed; refusing only
 *                meant the user had to go and do it by hand.
 */

import { isKnownTheme, isReservedThemeName } from '../utils/theme.js'
import { getOfficialThemesDir } from './loader.js'
import { getThemeOrigin } from './meta.js'
import { unregisterThemeWithTraits } from './register.js'
import { deleteThemeFile } from './save.js'
import {
  isStarterTheme,
  restoreStarterTheme,
  starterThemeNames,
} from './seed.js'

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

/**
 * Writes a deleted starter theme's file back. Returns false if the name is
 * not a starter theme, or if its file is already there.
 */
export async function restoreTheme(name: string): Promise<boolean> {
  return await restoreStarterTheme(name)
}

/** Starter themes with no file on disk — the ones `/theme restore` can bring back. */
export function hiddenThemeNames(): string[] {
  return starterThemeNames().filter(name => !isKnownTheme(name))
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

  const result = await deleteThemeFile(
    name,
    origin === 'official' ? getOfficialThemesDir() : undefined,
  )
  if (!result.ok) {
    return { ok: false, message: result.error }
  }

  unregisterThemeWithTraits(name)

  // Starter themes are seeded rather than authored, so there is a pristine
  // copy in the package to put back. Say so — otherwise deleting one looks
  // irreversible in a way it is not.
  if (isStarterTheme(name)) {
    return {
      ok: true,
      message: `Deleted “${name}”. It ships with cct, so run /theme restore ${name} to bring it back.`,
    }
  }
  return { ok: true, message: `Deleted “${name}”.` }
}
