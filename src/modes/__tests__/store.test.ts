import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resetSettingsCache } from '../../utils/settings/settingsCache.js'
import { migrateLegacyModeSetting, resolveModeSlug } from '../store.js'

// CLAUDE_CONFIG_DIR redirect rather than mocking the settings module:
// getClaudeConfigHomeDir memoizes on the env var, and userSettings resolves to
// <configDir>/settings.json, so the real read/write/merge path is exercised
// against a throwaway file. Mocking settings/settings.ts here would be
// process-global and would leak into every other suite in the run.
let tempDir: string
let previousConfigDir: string | undefined

function settingsPath(): string {
  return join(tempDir, 'settings.json')
}

function writeSettings(data: Record<string, unknown>): void {
  writeFileSync(settingsPath(), `${JSON.stringify(data, null, 2)}\n`)
  resetSettingsCache()
}

function readSettings(): Record<string, unknown> {
  return JSON.parse(readFileSync(settingsPath(), 'utf8'))
}

beforeEach(() => {
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  tempDir = mkdtempSync(join(tmpdir(), 'ccs-modes-'))
  process.env.CLAUDE_CONFIG_DIR = tempDir
  resetSettingsCache()
})

afterEach(() => {
  if (previousConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  }
  rmSync(tempDir, { recursive: true, force: true })
  resetSettingsCache()
})

describe('migrateLegacyModeSetting', () => {
  test('moves a pre-rename ccbMode to ccsMode and drops the old key', async () => {
    // The whole point: someone who picked a mode before the rename must not
    // be silently dropped back to default.
    writeSettings({ ccbMode: 'sharp', theme: 'matrix' })

    migrateLegacyModeSetting()

    const after = readSettings()
    expect(after.ccsMode).toBe('sharp')
    expect('ccbMode' in after).toBe(false)
    expect(after.theme).toBe('matrix') // untouched
  })

  test('never clobbers a value already under the new key', async () => {
    writeSettings({ ccbMode: 'gentle', ccsMode: 'workhorse' })

    migrateLegacyModeSetting()

    const after = readSettings()
    expect(after.ccsMode).toBe('workhorse')
    expect('ccbMode' in after).toBe(false)
  })

  test('is a no-op when there is nothing to migrate', async () => {
    writeSettings({ ccsMode: 'sharp' })
    const before = readFileSync(settingsPath(), 'utf8')

    migrateLegacyModeSetting()

    expect(readFileSync(settingsPath(), 'utf8')).toBe(before)
  })

  test('running twice changes nothing the second time', async () => {
    writeSettings({ ccbMode: 'token-saver' })

    migrateLegacyModeSetting()
    const afterFirst = readFileSync(settingsPath(), 'utf8')
    migrateLegacyModeSetting()

    expect(readFileSync(settingsPath(), 'utf8')).toBe(afterFirst)
  })

  test('ignores a non-string legacy value rather than migrating garbage', async () => {
    writeSettings({ ccbMode: 42 })

    migrateLegacyModeSetting()

    expect(readSettings().ccsMode).toBeUndefined()
  })
})

describe('resolveModeSlug', () => {
  test('reads the new key', () => {
    expect(resolveModeSlug({ ccsMode: 'sharp' })).toBe('sharp')
  })

  test('falls back to the legacy key when the migration has not run', () => {
    // Belt and braces: a read-only settings file, or a mode set in project
    // settings, means the migration may never write. The choice must survive.
    expect(resolveModeSlug({ ccbMode: 'gentle' })).toBe('gentle')
  })

  test('prefers the new key when both are present', () => {
    expect(resolveModeSlug({ ccbMode: 'gentle', ccsMode: 'workhorse' })).toBe(
      'workhorse',
    )
  })

  test('defaults when neither key is set', () => {
    expect(resolveModeSlug({})).toBe('default')
  })

  test('defaults on a non-string or empty value', () => {
    expect(resolveModeSlug({ ccsMode: 42 })).toBe('default')
    expect(resolveModeSlug({ ccsMode: '' })).toBe('default')
  })
})
