import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  serializeThemeJsonSchema,
  THEME_SCHEMA_FILENAME,
} from '../jsonSchema.js'
import { migrateLegacyThemes } from '../migrate.js'

// CLAUDE_CONFIG_DIR redirect: getClaudeConfigHomeDir's memoize is keyed on
// the env var (src/utils/envUtils.ts), so no cache clearing is needed.
// Committed precedent: src/assistant/__tests__/index.test.ts.
let tempDir: string
let previousConfigDir: string | undefined

const OURS = JSON.stringify({ mode: 'dark', colors: { claude: 'rgb(1,2,3)' } })
const OFFICIAL = JSON.stringify({ name: 'x', base: 'dark', overrides: {} })

function officialDir(): string {
  return join(tempDir, 'themes')
}
function ccDir(): string {
  return join(tempDir, 'ccs')
}

beforeEach(async () => {
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  tempDir = await mkdtemp(join(tmpdir(), 'cc-themes-migrate-'))
  process.env.CLAUDE_CONFIG_DIR = tempDir
})

afterEach(async () => {
  if (previousConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  }
  await rm(tempDir, { recursive: true, force: true })
})

describe('migrateLegacyThemes', () => {
  test('moves our-format files and leaves official-format files', async () => {
    await mkdir(officialDir(), { recursive: true })
    await writeFile(join(officialDir(), 'mine.json'), OURS)
    await writeFile(join(officialDir(), 'theirs.json'), OFFICIAL)
    await writeFile(join(officialDir(), 'junk.json'), '{ not json')

    const result = await migrateLegacyThemes()

    expect(result.moved).toEqual(['mine.json'])
    expect(await readdir(ccDir())).toContain('mine.json')
    const remaining = await readdir(officialDir())
    expect(remaining).toContain('theirs.json') // official stays
    expect(remaining).toContain('junk.json') // not ours to police
    expect(remaining).not.toContain('mine.json')
    // Content survives the move byte-for-byte.
    expect(await readFile(join(ccDir(), 'mine.json'), 'utf-8')).toBe(OURS)
  })

  test('never clobbers: a collision leaves both files intact', async () => {
    await mkdir(officialDir(), { recursive: true })
    await mkdir(ccDir(), { recursive: true })
    await writeFile(join(officialDir(), 'dup.json'), OURS)
    const existing = JSON.stringify({ mode: 'light', colors: {} })
    await writeFile(join(ccDir(), 'dup.json'), existing)

    const result = await migrateLegacyThemes()

    expect(result.moved).toEqual([])
    expect(result.skipped.some(s => s.file === 'dup.json')).toBe(true)
    expect(await readFile(join(officialDir(), 'dup.json'), 'utf-8')).toBe(OURS)
    expect(await readFile(join(ccDir(), 'dup.json'), 'utf-8')).toBe(existing)
  })

  test('removes OUR schema file from the shared dir', async () => {
    await mkdir(officialDir(), { recursive: true })
    await writeFile(
      join(officialDir(), THEME_SCHEMA_FILENAME),
      serializeThemeJsonSchema(),
    )

    const result = await migrateLegacyThemes()

    expect(result.schemaRemoved).toBe(true)
    expect(await readdir(officialDir())).not.toContain(THEME_SCHEMA_FILENAME)
  })

  test('leaves a schema file that is not ours (content guard)', async () => {
    // If official Claude Code ever writes its own schema there, deleting it
    // would be vandalism. The title is our fingerprint.
    await mkdir(officialDir(), { recursive: true })
    const foreign = JSON.stringify({ title: 'Some Other Schema' })
    await writeFile(join(officialDir(), THEME_SCHEMA_FILENAME), foreign)

    const result = await migrateLegacyThemes()

    expect(result.schemaRemoved).toBe(false)
    expect(
      await readFile(join(officialDir(), THEME_SCHEMA_FILENAME), 'utf-8'),
    ).toBe(foreign)
  })

  test('missing official dir: still creates ours, returns empty', async () => {
    const result = await migrateLegacyThemes()

    expect(result).toEqual({ moved: [], skipped: [], schemaRemoved: false })
    // The cc dir must exist regardless — the watcher cannot watch a missing
    // dir, and the first /theme create must land somewhere watched.
    expect(await readdir(tempDir)).toContain('ccs')
  })

  test('running twice is a no-op the second time', async () => {
    await mkdir(officialDir(), { recursive: true })
    await writeFile(join(officialDir(), 'mine.json'), OURS)

    const first = await migrateLegacyThemes()
    const second = await migrateLegacyThemes()

    expect(first.moved).toEqual(['mine.json'])
    expect(second).toEqual({ moved: [], skipped: [], schemaRemoved: false })
  })
})

// The directory has been renamed twice — cc-themes → cct → ccs — and either
// old name may still be sitting in somebody's ~/.claude, so both must drain.
describe.each(['cc-themes', 'cct'])('the %s → ccs rename', legacyName => {
  function legacyDir(): string {
    return join(tempDir, legacyName)
  }

  test('moves saved themes into the new directory and retires the old one', async () => {
    // These are the user's own generated themes. Losing them to a directory
    // rename would be the worst possible outcome of a cosmetic change.
    await mkdir(legacyDir(), { recursive: true })
    await writeFile(join(legacyDir(), 'cyberpunk.json'), OURS)
    await writeFile(join(legacyDir(), 'yellowish.json'), OURS)
    await writeFile(join(legacyDir(), '.schema.json'), '{"title":"x"}')

    const result = await migrateLegacyThemes()

    expect(result.moved.sort()).toEqual(['cyberpunk.json', 'yellowish.json'])
    expect((await readdir(ccDir())).sort()).toEqual([
      'cyberpunk.json',
      'yellowish.json',
    ])
    // The old directory is gone entirely, schema and all.
    expect(await readdir(tempDir)).not.toContain(legacyName)
  })

  test('carries the seed record across, so deleted starters stay deleted', async () => {
    // Leave .seeded behind and every starter theme the user deleted is
    // written back on the next launch — the one bug a directory rename can
    // introduce that looks like the app ignoring you.
    await mkdir(legacyDir(), { recursive: true })
    await writeFile(join(legacyDir(), '.seeded'), 'matrix\nsakura\nwinter\n')

    await migrateLegacyThemes()

    expect(await readFile(join(ccDir(), '.seeded'), 'utf-8')).toBe(
      'matrix\nsakura\nwinter\n',
    )
    expect(await readdir(tempDir)).not.toContain(legacyName)
  })

  test('never clobbers a theme that already exists under the new name', async () => {
    await mkdir(legacyDir(), { recursive: true })
    await mkdir(ccDir(), { recursive: true })
    await writeFile(join(legacyDir(), 'clash.json'), OURS)
    await writeFile(join(ccDir(), 'clash.json'), '{"mode":"light","colors":{}}')

    const result = await migrateLegacyThemes()

    expect(result.moved).not.toContain('clash.json')
    expect(result.skipped.map(s => s.file)).toContain('clash.json')
    // The newer file wins and the old one is left where it is to be resolved.
    expect(await readFile(join(ccDir(), 'clash.json'), 'utf-8')).toContain(
      'light',
    )
    expect(await readdir(legacyDir())).toContain('clash.json')
  })

  test('leaves anything it does not recognise, and the directory with it', async () => {
    await mkdir(legacyDir(), { recursive: true })
    await writeFile(join(legacyDir(), 'notes.txt'), 'keep me')

    await migrateLegacyThemes()

    expect(await readdir(legacyDir())).toEqual(['notes.txt'])
  })

  test('is a no-op the second time', async () => {
    await mkdir(legacyDir(), { recursive: true })
    await writeFile(join(legacyDir(), 'once.json'), OURS)

    await migrateLegacyThemes()
    const second = await migrateLegacyThemes()

    expect(second.moved).toEqual([])
    expect(second.skipped).toEqual([])
    expect(await readdir(ccDir())).toEqual(['once.json'])
  })
})

describe('two legacy directories at once', () => {
  test('the more recent name wins a filename collision', async () => {
    // Someone who has been on this fork since before both renames can have a
    // theme of the same name in each. cct is the newer of the two, so its
    // copy is the one that survives.
    const old = join(tempDir, 'cc-themes')
    const newer = join(tempDir, 'cct')
    await mkdir(old, { recursive: true })
    await mkdir(newer, { recursive: true })
    await writeFile(join(old, 'clash.json'), OURS)
    await writeFile(join(newer, 'clash.json'), '{"mode":"light","colors":{}}')

    await migrateLegacyThemes()

    expect(await readFile(join(ccDir(), 'clash.json'), 'utf-8')).toContain(
      'light',
    )
    // The loser is left in place rather than deleted, for the user to resolve.
    expect(await readdir(old)).toContain('clash.json')
  })
})
