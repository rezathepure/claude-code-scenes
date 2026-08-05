/**
 * Writes the starter themes into ~/.claude/ccs as ordinary theme files.
 *
 * They used to be registered straight out of the binary at startup, which
 * made them a category of their own: undeletable in the normal sense (there
 * was no file to unlink, so `/theme delete` had to record the name in config
 * instead), un-editable without a rebuild, and invisible to anyone who went
 * looking for where their themes live.
 *
 * Seeding them to disk collapses that special case. A starter theme is now
 * just a theme file: `loadUserThemes` finds it the same way it finds anything
 * the user wrote, the watcher hot-reloads edits to it, and deleting one is
 * deleting a file. The JSON still ships inside the package — that is how it
 * gets onto the machine at all, and `generate/prompt.ts` quotes several of
 * them as worked examples — but the binary is no longer where they live.
 *
 * Two rules keep this from being annoying:
 *
 *  - **Never overwrite.** An existing file always wins, so editing a starter
 *    survives upgrading.
 *  - **Never resurrect.** A name is recorded the first time it is seeded, and
 *    a recorded name is never written again — otherwise deleting a starter
 *    would undo itself on the next launch.
 *
 * The record is a file beside the themes rather than a key in global config,
 * so the directory carries its own state: move it to another machine and the
 * deletions move with it, delete the directory and seeding starts over, which
 * is what someone clearing it out would expect. It has no `.json` extension
 * precisely so `loadUserThemes` — which scans for `*.json` — walks past it.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { logForDebugging } from '../utils/debug.js'
import { STARTER_THEMES } from './bundled/index.js'
import { getCcsThemesDir } from './loader.js'

/**
 * Names already seeded, one per line. Extensionless so the scanner skips it.
 * Exported for the migration, which has to carry it across a directory rename
 * — leave it behind and every starter theme the user deleted comes back.
 */
export const SEED_RECORD_FILENAME = '.seeded'

export type SeedResult = {
  /** Names written to disk by this call. */
  written: string[]
}

/** Every starter theme name, in the order they are offered. */
export function starterThemeNames(): string[] {
  return STARTER_THEMES.map(([name]) => name)
}

/** Whether a name is one of the themes shipped with the package. */
export function isStarterTheme(name: string): boolean {
  return STARTER_THEMES.some(([starter]) => starter === name)
}

function recordPath(): string {
  return join(getCcsThemesDir(), SEED_RECORD_FILENAME)
}

async function readRecord(): Promise<Set<string>> {
  try {
    const text = await readFile(recordPath(), 'utf8')
    return new Set(
      text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0),
    )
  } catch {
    // Absent on first run, and an unreadable one is not worth failing over:
    // the worst case is re-seeding a theme the user deleted, once.
    return new Set()
  }
}

async function writeRecord(names: Set<string>): Promise<void> {
  try {
    await writeFile(recordPath(), `${[...names].join('\n')}\n`, 'utf8')
  } catch (error) {
    logForDebugging(`[themes] could not record seeded themes: ${error}`)
  }
}

/**
 * Serialised the way the generator writes themes, so a starter file and one
 * the user designed are indistinguishable in an editor.
 */
function serialise(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`
}

/**
 * Ensures every starter theme exists on disk, then reports what was written.
 *
 * Must run before `loadUserThemes`, which is what actually registers them,
 * and after `migrateLegacyThemes`, so a file moved out of the old directory
 * is already in place and wins over the shipped copy.
 */
export async function seedStarterThemes(): Promise<SeedResult> {
  const dir = getCcsThemesDir()
  const written: string[] = []

  try {
    await mkdir(dir, { recursive: true })
  } catch (error) {
    logForDebugging(`[themes] could not create ${dir}: ${error}`)
    return { written }
  }

  const record = await readRecord()
  const before = record.size

  for (const [name, data] of STARTER_THEMES) {
    if (record.has(name)) continue

    try {
      // wx fails if the path exists, which makes "do not clobber" a property
      // of the write itself rather than a check that could race the watcher.
      await writeFile(join(dir, `${name}.json`), serialise(data), {
        encoding: 'utf8',
        flag: 'wx',
      })
      written.push(name)
      record.add(name)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        // The user already has a theme by this name — theirs, or ours from
        // before the record existed. Either way it is now accounted for and
        // must not be written again.
        record.add(name)
        continue
      }
      logForDebugging(`[themes] could not seed “${name}”: ${error}`)
    }
  }

  if (record.size !== before) await writeRecord(record)
  return { written }
}

/**
 * Puts a deleted starter theme back. Returns false if the name is not a
 * starter theme, or if its file is already there.
 */
export async function restoreStarterTheme(name: string): Promise<boolean> {
  const entry = STARTER_THEMES.find(([starter]) => starter === name)
  if (entry === undefined) return false

  try {
    await mkdir(getCcsThemesDir(), { recursive: true })
    await writeFile(
      join(getCcsThemesDir(), `${name}.json`),
      serialise(entry[1]),
      { encoding: 'utf8', flag: 'wx' },
    )
  } catch {
    return false
  }

  const record = await readRecord()
  if (!record.has(name)) {
    record.add(name)
    await writeRecord(record)
  }
  return true
}
