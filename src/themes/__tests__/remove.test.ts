/**
 * The delete policy.
 *
 * Shared by `/theme delete` and the grid's `d` key, and it is the only thing
 * standing between a keypress and a file. The grid asks BEFORE it offers a
 * confirmation, so a wrong answer here means offering to delete something
 * that cannot be deleted — or worse, refusing something that can.
 *
 * Everything except the six built-in palettes is removable. Built-ins have no
 * file and are what ink falls back to, so there is nothing to unlink and
 * nothing to fall back to if there were.
 */

import { afterEach, describe, expect, test } from 'bun:test'
import { registerStarterThemesForTest } from './registerStarters.js'
import { canDeleteTheme } from '../remove.js'
import {
  registerThemeWithTraits,
  unregisterThemeWithTraits,
} from '../register.js'
import { getTheme } from '../../utils/theme.js'

registerStarterThemesForTest()

const registered: string[] = []
afterEach(() => {
  while (registered.length > 0) {
    unregisterThemeWithTraits(registered.pop()!)
  }
})

function register(name: string, origin: 'cc' | 'official'): void {
  registerThemeWithTraits(name, getTheme('dark'), 'dark', undefined, { origin })
  registered.push(name)
}

describe('canDeleteTheme', () => {
  test('allows a theme we wrote', () => {
    register('test-only-mine', 'cc')
    expect(canDeleteTheme('test-only-mine')).toEqual({ deletable: true })
  })

  test('allows an official theme — it is a real file we can remove', () => {
    // Previously refused, which only meant the user had to go and delete it
    // by hand in ~/.claude/themes.
    register('test-only-official', 'official')
    expect(canDeleteTheme('test-only-official')).toEqual({ deletable: true })
  })

  test('allows a starter theme, which is a real file like any other', () => {
    // matrix ships in the package but is seeded into ~/.claude/cct, so
    // deleting it unlinks a file; the seed record is what stops it being
    // written back on the next launch.
    expect(canDeleteTheme('matrix')).toEqual({ deletable: true })
    expect(canDeleteTheme('winter')).toEqual({ deletable: true })
  })

  test('refuses a built-in, which has no file and is the fallback', () => {
    for (const name of ['dark', 'light']) {
      const result = canDeleteTheme(name)
      expect({ name, deletable: result.deletable }).toEqual({
        name,
        deletable: false,
      })
      if (!result.deletable) expect(result.reason).toContain('built-in')
    }
  })

  test('refuses a name that is not a theme at all', () => {
    const result = canDeleteTheme('test-only-nonexistent')
    expect(result.deletable).toBe(false)
    if (!result.deletable) expect(result.reason).toContain('No theme called')
  })

  test('says cct, never cc-themes', () => {
    for (const name of ['dark', 'test-only-nonexistent']) {
      const result = canDeleteTheme(name)
      if (!result.deletable) expect(result.reason).not.toContain('cc-themes')
    }
  })
})
