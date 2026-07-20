/**
 * One-time migration of our theme files out of the directory official
 * Claude Code also reads.
 *
 * Both this fork and official CC watch ~/.claude/themes. The formats differ,
 * so each picker used to list files it could not actually render — official
 * even listed our editor-autocomplete `.schema.json` as a theme. Everything
 * we write now lives in ~/.claude/cc-themes; this moves our-format files
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
  stat,
} from 'node:fs/promises'
import { join } from 'node:path'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage, isENOENT } from '../utils/errors.js'
import { jsonParse } from '../utils/slowOperations.js'
import { THEME_SCHEMA_FILENAME } from './jsonSchema.js'
import { getCcThemesDir, getOfficialThemesDir } from './loader.js'
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

export async function migrateLegacyThemes(): Promise<MigrationResult> {
  const result: MigrationResult = {
    moved: [],
    skipped: [],
    schemaRemoved: false,
  }
  const ccDir = getCcThemesDir()
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
