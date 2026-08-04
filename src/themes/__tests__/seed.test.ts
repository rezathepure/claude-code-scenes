/**
 * Seeding the starter themes onto disk.
 *
 * Two rules carry the whole design, and both are the kind that only break
 * once a user has already lost something:
 *
 *  - an existing file is never overwritten, so editing a starter survives an
 *    upgrade;
 *  - a starter that has been seeded once is never written again, so deleting
 *    one is permanent rather than undone on the next launch.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { logMock } from '../../../tests/mocks/log'
import { debugMock } from '../../../tests/mocks/debug'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

// Nothing here mocks global config, and the seed record deliberately does not
// live there: seven other test files call mock.module on src/utils/config.ts,
// and because that is process-global rather than per-file, whichever ran first
// would decide whether saveGlobalConfig actually stored anything. The record
// is a file in the themes directory instead, which a temp HOME isolates
// completely.
let tempHome: string
const origHome = process.env.CLAUDE_CONFIG_DIR

beforeEach(() => {
  // CLAUDE_CONFIG_DIR is what getClaudeConfigHomeDir reads, and it is memoized
  // on that variable — so pointing it at a temp directory genuinely isolates
  // the writes rather than just appearing to.
  tempHome = mkdtempSync(join(tmpdir(), 'cct-seed-'))
  process.env.CLAUDE_CONFIG_DIR = tempHome
})

afterEach(() => {
  if (origHome === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = origHome
  rmSync(tempHome, { recursive: true, force: true })
})

async function seed() {
  const { seedStarterThemes } = await import('../seed.js')
  return await seedStarterThemes()
}

function cctDir(): string {
  return join(tempHome, 'cct')
}

describe('seedStarterThemes', () => {
  test('writes every starter theme as a readable JSON file', async () => {
    const { starterThemeNames } = await import('../seed.js')
    const result = await seed()

    expect(result.written.sort()).toEqual(starterThemeNames().sort())

    for (const name of starterThemeNames()) {
      const file = join(cctDir(), `${name}.json`)
      expect(existsSync(file)).toBe(true)
      // Parseable and recognisably a theme, not just bytes on disk.
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      expect(typeof parsed.colors).toBe('object')
      expect(['dark', 'light']).toContain(parsed.mode)
    }
  })

  test('records what it seeded, so a second run writes nothing', async () => {
    await seed()
    const second = await seed()
    expect(second.written).toEqual([])
  })

  test('does not resurrect a starter the user deleted', async () => {
    await seed()

    const matrix = join(cctDir(), 'matrix.json')
    rmSync(matrix)

    const after = await seed()
    expect(after.written).toEqual([])
    // The whole point: deleting a starter has to stick across restarts.
    expect(existsSync(matrix)).toBe(false)
  })

  test('never overwrites a file that is already there', async () => {
    mkdirSync(cctDir(), { recursive: true })
    const matrix = join(cctDir(), 'matrix.json')
    writeFileSync(matrix, '{"mine":true}', 'utf8')

    const result = await seed()

    expect(readFileSync(matrix, 'utf8')).toBe('{"mine":true}')
    expect(result.written).not.toContain('matrix')
    // Still accounted for, so the next run does not try again and clobber it.
    expect(readFileSync(join(cctDir(), '.seeded'), 'utf8')).toContain('matrix')
  })

  test('creates the themes directory when it does not exist', async () => {
    expect(existsSync(cctDir())).toBe(false)
    await seed()
    expect(existsSync(cctDir())).toBe(true)
  })
})

describe('restoreStarterTheme', () => {
  test('writes a deleted starter back', async () => {
    const { restoreStarterTheme } = await import('../seed.js')
    await seed()

    const matrix = join(cctDir(), 'matrix.json')
    rmSync(matrix)

    expect(await restoreStarterTheme('matrix')).toBe(true)
    expect(existsSync(matrix)).toBe(true)
  })

  test('refuses a theme the user wrote, which has no pristine copy', async () => {
    const { restoreStarterTheme } = await import('../seed.js')
    expect(await restoreStarterTheme('something-i-made-up')).toBe(false)
  })

  test('refuses when the file is already present, rather than clobbering it', async () => {
    const { restoreStarterTheme } = await import('../seed.js')
    await seed()

    const matrix = join(cctDir(), 'matrix.json')
    writeFileSync(matrix, '{"edited":true}', 'utf8')

    expect(await restoreStarterTheme('matrix')).toBe(false)
    expect(readFileSync(matrix, 'utf8')).toBe('{"edited":true}')
  })
})

describe('isStarterTheme', () => {
  test('recognises the shipped names and nothing else', async () => {
    const { isStarterTheme } = await import('../seed.js')
    expect(isStarterTheme('matrix')).toBe(true)
    expect(isStarterTheme('winter')).toBe(true)
    expect(isStarterTheme('teddy-bear-teddy')).toBe(false)
  })
})
