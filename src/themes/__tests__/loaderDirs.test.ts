import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getTheme, isKnownTheme } from '../../utils/theme.js'
import { THEME_SCHEMA_FILENAME } from '../jsonSchema.js'
import {
  getCctThemesDir,
  getOfficialThemesDir,
  loadUserThemes,
  resetLoadedThemeTracking,
} from '../loader.js'
import { getThemeMeta } from '../meta.js'
import { unregisterThemeWithTraits } from '../register.js'

let tempDir: string
let previousConfigDir: string | undefined
let loadedNames: string[] = []

beforeEach(async () => {
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  tempDir = await mkdtemp(join(tmpdir(), 'cc-themes-dirs-'))
  process.env.CLAUDE_CONFIG_DIR = tempDir
  await mkdir(getOfficialThemesDir(), { recursive: true })
  await mkdir(getCctThemesDir(), { recursive: true })
})

afterEach(async () => {
  // Registries are process-global; drop everything this file registered.
  for (const name of loadedNames) {
    unregisterThemeWithTraits(name)
  }
  loadedNames = []
  resetLoadedThemeTracking()
  if (previousConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  }
  await rm(tempDir, { recursive: true, force: true })
})

async function load(): Promise<Awaited<ReturnType<typeof loadUserThemes>>> {
  const result = await loadUserThemes()
  loadedNames.push(...result.themes.map(t => t.name))
  return result
}

describe('loading from both directories', () => {
  test('merges cc and official themes with correct origins', async () => {
    await writeFile(
      join(getCctThemesDir(), 'test-only-ours.json'),
      JSON.stringify({ mode: 'dark', colors: { claude: 'rgb(9,9,9)' } }),
    )
    await writeFile(
      join(getOfficialThemesDir(), 'test-only-theirs.json'),
      JSON.stringify({ name: 'ignored', base: 'light', overrides: {} }),
    )

    const { themes, warnings } = await load()

    expect(warnings).toEqual([])
    expect(themes.map(t => [t.name, t.origin]).sort()).toEqual([
      ['test-only-ours', 'cc'],
      ['test-only-theirs', 'official'],
    ])
    expect(getThemeMeta('test-only-theirs')?.origin).toBe('official')
    expect(getThemeMeta('test-only-ours')?.origin).toBe('cc')
  })

  test('an official theme with empty overrides inherits its base fully', async () => {
    // The shape of the user's real test.json.
    await writeFile(
      join(getOfficialThemesDir(), 'test-only-bare.json'),
      JSON.stringify({ name: 'bare', base: 'dark', overrides: {} }),
    )

    await load()

    expect(isKnownTheme('test-only-bare')).toBe(true)
    const dark = getTheme('dark') as unknown as Record<string, string>
    const loaded = getTheme('test-only-bare') as unknown as Record<
      string,
      string
    >
    expect(loaded.text).toBe(dark.text)
    expect(getThemeMeta('test-only-bare')?.mode).toBe('dark')
  })

  test('a cc theme shadows a same-named official theme, single entry', async () => {
    await writeFile(
      join(getOfficialThemesDir(), 'test-only-shadow.json'),
      JSON.stringify({ name: 'x', base: 'light', overrides: {} }),
    )
    await writeFile(
      join(getCctThemesDir(), 'test-only-shadow.json'),
      JSON.stringify({ mode: 'dark', colors: { claude: 'rgb(7,7,7)' } }),
    )

    const { themes } = await load()
    const matches = themes.filter(t => t.name === 'test-only-shadow')

    expect(matches).toHaveLength(1)
    expect(matches[0]!.origin).toBe('cc')
    expect(
      (getTheme('test-only-shadow') as unknown as Record<string, string>)
        .claude,
    ).toBe('rgb(7,7,7)')
  })

  test('junk in the official dir is ignored without warnings', async () => {
    await writeFile(join(getOfficialThemesDir(), 'junk.json'), '{ not json')
    await writeFile(
      join(getOfficialThemesDir(), 'unrelated.json'),
      JSON.stringify({ some: 'config' }),
    )

    const { themes, warnings } = await load()

    expect(themes).toEqual([])
    expect(warnings).toEqual([])
  })

  test('the schema file is written to the cc dir only', async () => {
    await load()
    // Give the fire-and-forget schema write a beat to land.
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(await readdir(getCctThemesDir())).toContain(THEME_SCHEMA_FILENAME)
    expect(await readdir(getOfficialThemesDir())).not.toContain(
      THEME_SCHEMA_FILENAME,
    )
  })
})
