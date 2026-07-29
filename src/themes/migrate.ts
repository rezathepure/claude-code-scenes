/**
 * One-time migration of our theme files out of the directory official
 * Claude Code also reads.
 *
 * Both this fork and official CC watch ~/.claude/themes. The formats differ,
 * so each picker used to list files it could not actually render — official
 * even listed our editor-autocomplete `.schema.json` as a theme. Everything
 * we write now lives in ~/.claude/cct; this moves our-format files
 * there once, leaves official-format files where official expects them, and
 * removes our schema file from the shared directory.
 *
 * Runs from init strictly BEFORE the theme watcher starts — inside
 * loadUserThemes it would fire the watcher with our own renames and could
 * move a file out from under an open editor mid-session. Idempotent by
 * construction: after moving, nothing in the shared directory matches our
 * shape any more. Never throws; a failed move just leaves the file to be
 * loaded in place (as origin 'official') and retried next startup.
 */

import {
  constants,
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  stat,
} from 'node:fs/promises'
import { join } from 'node:path'
import { logForDebugging } from '../utils/debug.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { errorMessage, isENOENT } from '../utils/errors.js'
import { jsonParse } from '../utils/slowOperations.js'
import { THEME_SCHEMA_FILENAME } from './jsonSchema.js'
import {
  getCctThemesDir,
  getOfficialThemesDir,
  LEGACY_CCT_THEMES_DIRNAME,
} from './loader.js'
import { isOurThemeShape } from './schema.js'

export type MigrationResult = {
  moved: string[]
  skipped: Array<{ file: string; reason: string }>
  schemaRemoved: boolean
}

/** True if the error is a cross-device rename (needs copy + rm instead). */
function isEXDEV(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'EXDEV'
  )
}

/**
 * Moves themes out of ~/.claude/cc-themes, the name this directory had before
 * it became ~/.claude/cct.
 *
 * Everything in there was written by us, so unlike the official sweep there is
 * no shape check — every .json moves. The schema file is not moved because it
 * is regenerated on every load; it is deleted so the empty directory can go
 * too, and a directory that still has anything in it is simply left alone.
 *
 * Idempotent: once the old directory is gone this returns immediately, and a
 * name that already exists in the new directory is never clobbered.
 */
async function adoptLegacyDirectory(
  cctDir: string,
  result: MigrationResult,
): Promise<void> {
  const legacyDir = join(getClaudeConfigHomeDir(), LEGACY_CCT_THEMES_DIRNAME)
  if (legacyDir === cctDir) return

  let entries: string[]
  try {
    entries = await readdir(legacyDir)
  } catch (error) {
    if (!isENOENT(error)) {
      logForDebugging(
        `[themes] Cannot read ${legacyDir}: ${errorMessage(error)}`,
      )
    }
    return
  }

  for (const file of entries.filter(
    e => e.endsWith('.json') && e !== THEME_SCHEMA_FILENAME,
  )) {
    const source = join(legacyDir, file)
    const target = join(cctDir, file)

    try {
      await stat(target)
      result.skipped.push({ file, reason: `already exists in ${cctDir}` })
      continue
    } catch {
      // Missing target is the normal case.
    }

    try {
      try {
        await rename(source, target)
      } catch (error) {
        if (!isEXDEV(error)) throw error
        await copyFile(source, target, constants.COPYFILE_EXCL)
        await rm(source)
      }
      result.moved.push(file)
    } catch (error) {
      result.skipped.push({ file, reason: errorMessage(error) })
    }
  }

  // Drop our regenerated schema, then retire the directory. rmdir fails on a
  // non-empty directory, which is exactly the behaviour we want: anything the
  // user left in there keeps it alive rather than being deleted.
  try {
    await rm(join(legacyDir, THEME_SCHEMA_FILENAME))
  } catch {
    // Missing is fine.
  }
  try {
    await rmdir(legacyDir)
  } catch {
    // Not empty, or already gone.
  }
}

export async function migrateLegacyThemes(): Promise<MigrationResult> {
  const result: MigrationResult = {
    moved: [],
    skipped: [],
    schemaRemoved: false,
  }
  const ccDir = getCctThemesDir()
  const officialDir = getOfficialThemesDir()

  // Always ensure our directory exists: the watcher skips missing dirs and
  // only notices new ones on restart, and a fresh install's first
  // `/theme create` must land in a watched directory.
  try {
    await mkdir(ccDir, { recursive: true })
  } catch (error) {
    logForDebugging(`[themes] Cannot create ${ccDir}: ${errorMessage(error)}`, {
      level: 'warn',
    })
    // Continue: individual moves below will fail and be recorded.
  }

  // Our own directory was renamed cc-themes → cct. Do this BEFORE the sweep
  // below, so a theme that has been sitting in the old directory since before
  // the rename ends up in one place rather than racing the official sweep for
  // the same filename.
  await adoptLegacyDirectory(ccDir, result)

  let entries: string[]
  try {
    entries = await readdir(officialDir)
  } catch (error) {
    if (!isENOENT(error)) {
      logForDebugging(
        `[themes] Cannot read ${officialDir} for migration: ${errorMessage(error)}`,
      )
    }
    return result
  }

  const candidates = entries
    .filter(e => e.endsWith('.json') && e !== THEME_SCHEMA_FILENAME)
    .sort()

  for (const file of candidates) {
    const source = join(officialDir, file)

    let raw: unknown
    try {
      raw = jsonParse(await readFile(source, 'utf-8'))
    } catch (error) {
      if (!isENOENT(error)) {
        result.skipped.push({ file, reason: 'unreadable or invalid JSON' })
      }
      continue
    }

    // Only files in OUR format move. Official-format and unknown files stay —
    // it is official's directory, not ours to police.
    if (!isOurThemeShape(raw)) continue

    const target = join(ccDir, file)
    let targetExists = false
    try {
      await stat(target)
      targetExists = true
    } catch {
      // Missing target is the normal case.
    }
    if (targetExists) {
      // Never clobber. The stray copy keeps loading in place (as origin
      // 'official') and is shadowed by the cc copy — coherent, and the user
      // can resolve it by deleting whichever they don't want.
      result.skipped.push({
        file,
        reason: `already exists in ${ccDir}`,
      })
      continue
    }

    try {
      try {
        await rename(source, target)
      } catch (error) {
        if (!isEXDEV(error)) throw error
        // Different filesystem: copy without clobbering, then remove.
        await copyFile(source, target, constants.COPYFILE_EXCL)
        await rm(source)
      }
      result.moved.push(file)
    } catch (error) {
      result.skipped.push({ file, reason: errorMessage(error) })
    }
  }

  // Remove OUR schema file from the shared directory — content-guarded so we
  // can never delete a schema official CC might someday write itself.
  try {
    const schemaPath = join(officialDir, THEME_SCHEMA_FILENAME)
    const parsed = jsonParse(await readFile(schemaPath, 'utf-8')) as {
      title?: unknown
    }
    if (parsed?.title === 'Claude Code theme') {
      await rm(schemaPath)
      result.schemaRemoved = true
    }
  } catch {
    // Missing, unreadable, or not ours — all fine.
  }

  if (
    result.moved.length > 0 ||
    result.skipped.length > 0 ||
    result.schemaRemoved
  ) {
    logForDebugging(
      `[themes] Migration: moved ${result.moved.length} theme(s) to ${ccDir}` +
        (result.skipped.length > 0
          ? `; skipped ${result.skipped.map(s => `${s.file} (${s.reason})`).join(', ')}`
          : '') +
        (result.schemaRemoved ? '; removed stale schema from shared dir' : ''),
    )
  }

  return result
}
