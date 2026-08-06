import { describe, expect, test } from 'bun:test'
import { planModeSettingMigration, resolveModeSlug } from '../store.js'

// Deliberately no filesystem and no settings-module import. An earlier version
// of this file drove the real read/write path through a temp CLAUDE_CONFIG_DIR
// and passed locally, then failed in CI: other suites replace
// utils/settings/settings.ts with `mock.module`, which in Bun is process-global
// and applies in whatever order the runner happens to load files. A mocked
// updateSettingsForSource writes nothing, so the assertions failed with no
// clue as to why. Both halves of the migration are pure here, so nothing
// another file does can reach them.

describe('planModeSettingMigration', () => {
  test('moves a pre-rename ccbMode to ccsMode and deletes the old key', () => {
    // The whole point: someone who picked a mode before the rename must not
    // be silently dropped back to default.
    const patch = planModeSettingMigration({
      ccbMode: 'sharp',
      theme: 'matrix',
    })

    expect(patch).not.toBeNull()
    expect(patch?.ccsMode).toBe('sharp')
    // Present-but-undefined is what signals deletion to the settings merge,
    // so the key has to exist — `patch.ccbMode === undefined` alone would
    // also be true if the key were simply absent.
    expect(patch !== null && 'ccbMode' in patch).toBe(true)
    expect(patch?.ccbMode).toBeUndefined()
    // Nothing else is touched: the patch is merged, not written wholesale.
    expect(patch !== null && 'theme' in patch).toBe(false)
  })

  test('never clobbers a value already under the new key', () => {
    const patch = planModeSettingMigration({
      ccbMode: 'gentle',
      ccsMode: 'workhorse',
    })

    expect(patch !== null && 'ccsMode' in patch).toBe(false)
    expect(patch !== null && 'ccbMode' in patch).toBe(true)
    expect(patch?.ccbMode).toBeUndefined()
  })

  test('does nothing when there is no legacy key', () => {
    expect(planModeSettingMigration({ ccsMode: 'sharp' })).toBeNull()
    expect(planModeSettingMigration({})).toBeNull()
    expect(planModeSettingMigration(undefined)).toBeNull()
  })

  test('ignores a non-string legacy value rather than migrating garbage', () => {
    expect(planModeSettingMigration({ ccbMode: 42 })).toBeNull()
    expect(planModeSettingMigration({ ccbMode: null })).toBeNull()
    expect(planModeSettingMigration({ ccbMode: { slug: 'sharp' } })).toBeNull()
  })

  test('is idempotent: after the patch is applied there is nothing left to do', () => {
    const settings: Record<string, unknown> = { ccbMode: 'token-saver' }
    const patch = planModeSettingMigration(settings)

    // Apply it the way the settings merge would.
    const applied: Record<string, unknown> = { ...settings, ...patch }
    delete applied.ccbMode

    expect(applied.ccsMode).toBe('token-saver')
    expect(planModeSettingMigration(applied)).toBeNull()
  })
})

describe('resolveModeSlug', () => {
  test('reads the new key', () => {
    expect(resolveModeSlug({ ccsMode: 'sharp' })).toBe('sharp')
  })

  test('falls back to the legacy key when the migration has not run', () => {
    // Belt and braces: a read-only settings file, or a mode set in project
    // rather than user settings, means the migration may never write. The
    // choice still has to survive.
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
    expect(resolveModeSlug({ ccsMode: null, ccbMode: 'sharp' })).toBe('sharp')
  })
})
