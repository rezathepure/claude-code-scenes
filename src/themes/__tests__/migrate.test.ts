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
  return join(tempDir, 'cc-themes')
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
    expect(await readdir(tempDir)).toContain('cc-themes')
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
