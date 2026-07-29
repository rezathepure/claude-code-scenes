/**
 * Folding a refinement into a draft.
 *
 * The bug this design invites is losing the draft: `parseThemeFile` is reused
 * for the repair machinery, and the obvious next call — `resolveThemeColors` —
 * fills missing slots from the BUILT-IN palette. On a first generation that is
 * right; here it would reset every slot the refinement did not mention, so a
 * request to warm one green would quietly discard the whole design. Most of
 * what follows exists to hold that line.
 */

import { describe, expect, test } from 'bun:test'
import { FIELD_PARAMS } from '../../scene/grammar.js'
import { getTheme } from '../../utils/theme.js'
import { mergeRefinement, type ThemeDraft } from '../generate/refine.js'
import { loadThemeFromText } from '../loader.js'

/** A complete, validated draft — the shape refinement always starts from. */
function makeDraft(overrides: Partial<ThemeDraft> = {}): ThemeDraft {
  return {
    name: 'test-only-refine',
    mode: 'dark',
    colors: { ...(getTheme('dark') as unknown as Record<string, string>) },
    warnings: [],
    ...overrides,
  }
}

/** A clamped SceneConfig, built the way the loader builds one. */
function sceneFromFile(scene: unknown) {
  const loaded = loadThemeFromText(
    'test-only-refine',
    JSON.stringify({ mode: 'dark', scene, colors: {} }),
  )
  expect(loaded.warnings.filter(w => w.severity === 'error')).toEqual([])
  return loaded.theme?.scene
}

describe('mergeRefinement', () => {
  test('a delta lands and everything else is preserved', () => {
    const draft = makeDraft()
    const before = { ...draft.colors }

    const { draft: next, change } = mergeRefinement(draft, {
      note: 'Warmed the warning.',
      colors: { warning: 'rgb(230,160,60)' },
    })

    expect(next.colors.warning).toBe('rgb(230,160,60)')
    expect(change.changedSlots).toEqual(['warning'])
    expect(change.noop).toBe(false)
    expect(change.note).toBe('Warmed the warning.')

    // The whole point: every other slot is byte-identical, not refilled from
    // the built-in and not dropped.
    const untouched = Object.keys(before).filter(k => k !== 'warning')
    expect(untouched.length).toBeGreaterThan(60)
    for (const slot of untouched) {
      expect({ slot, value: next.colors[slot] }).toEqual({
        slot,
        value: before[slot],
      })
    }
  })

  test('preserves a draft whose colours differ from the built-in', () => {
    // The failure mode is invisible when the draft happens to equal `dark`.
    const draft = makeDraft({
      colors: {
        ...(getTheme('dark') as unknown as Record<string, string>),
        claude: 'rgb(0,255,65)',
        subtle: 'rgb(58,102,70)',
      },
    })

    const { draft: next } = mergeRefinement(draft, {
      note: 'Cooler errors.',
      colors: { error: 'rgb(255,90,70)' },
    })

    expect(next.colors.claude).toBe('rgb(0,255,65)')
    expect(next.colors.subtle).toBe('rgb(58,102,70)')
  })

  test('an unknown slot is dropped with a warning, not written', () => {
    const { draft: next, change } = mergeRefinement(makeDraft(), {
      note: 'Tried something.',
      colors: { warning: 'rgb(230,160,60)', notASlot: 'rgb(1,2,3)' },
    })

    expect(next.colors.notASlot).toBeUndefined()
    expect(change.changedSlots).toEqual(['warning'])
    expect(next.warnings.some(w => w.type === 'unknown_slot')).toBe(true)
  })

  test('an omitted scene is left exactly as it was', () => {
    const scene = sceneFromFile({
      kind: 'custom',
      label: 'drizzle',
      fields: [{ motion: 'fall', glyphs: 'katakana', color: 'claude' }],
    })
    const draft = makeDraft({ ...(scene !== undefined ? { scene } : {}) })

    const { draft: next, change } = mergeRefinement(draft, {
      note: 'Brighter greens.',
      colors: { success: 'rgb(0,200,80)' },
    })

    expect(change.sceneChanged).toBe(false)
    expect(next.scene).toEqual(draft.scene!)
  })

  test('a present scene replaces wholesale and is clamped on the way in', () => {
    const draft = makeDraft({
      ...(sceneFromFile({ kind: 'rain' }) !== undefined
        ? { scene: sceneFromFile({ kind: 'rain' })! }
        : {}),
    })

    const { draft: next, change } = mergeRefinement(draft, {
      note: 'Slower, sparser rain.',
      scene: {
        kind: 'custom',
        label: 'slow drizzle',
        // density is way out of range; the shared clamp path repairs it
        // rather than dropping the layer.
        fields: [
          { motion: 'fall', glyphs: 'katakana', color: 'claude', density: 99 },
        ],
      },
    })

    expect(change.sceneChanged).toBe(true)
    expect(next.scene?.kind).toBe('custom')
    if (next.scene?.kind === 'custom') {
      const spec = FIELD_PARAMS.density
      expect(spec.type).toBe('number')
      if (spec.type === 'number') {
        expect(next.scene.scene.fields[0]!.density).toBe(spec.max)
      }
    }
    expect(next.warnings.length).toBeGreaterThan(0)
  })

  test('a payload with no mode still parses — the envelope supplies it', () => {
    // parseThemeFile hard-rejects a file without `mode` and `colors`; a
    // refinement sends neither. If the envelope ever stops being added this
    // test is what says so.
    const { change } = mergeRefinement(makeDraft(), {
      note: 'Just the one slot.',
      colors: { error: 'rgb(255,90,70)' },
    })
    expect(change.noop).toBe(false)
  })

  test('an echo of the current values changes nothing', () => {
    const draft = makeDraft()
    const { draft: next, change } = mergeRefinement(draft, {
      note: 'No change needed.',
      colors: { warning: draft.colors.warning!, error: draft.colors.error! },
    })

    expect(change.noop).toBe(true)
    expect(change.changedSlots).toEqual([])
    // Same object back: a no-op must not push an undo entry that undoes
    // nothing, and returning the draft unchanged is how the caller can tell.
    expect(next).toBe(draft)
  })

  test('an empty response is a no-op rather than a crash', () => {
    const draft = makeDraft()
    expect(mergeRefinement(draft, {}).change.noop).toBe(true)
    expect(mergeRefinement(draft, null).change.noop).toBe(true)
    expect(mergeRefinement(draft, 'nonsense').change.noop).toBe(true)
  })

  test('contrast is judged over the merged palette, not the delta', () => {
    // A near-black error on a dark theme is unreadable only in relation to the
    // rest, which is why validation cannot run on the delta alone.
    const { draft: next } = mergeRefinement(makeDraft(), {
      note: 'Darker errors.',
      colors: { error: 'rgb(20,8,8)' },
    })
    expect(next.warnings.length).toBeGreaterThan(0)
    expect(next.colors.error).not.toBe('rgb(20,8,8)')
  })

  test('keeps the description — a refinement is not a rename', () => {
    const draft = makeDraft({ description: 'Neon violet through acid rain' })
    const { draft: next } = mergeRefinement(draft, {
      note: 'Warmer.',
      colors: { warning: 'rgb(230,160,60)' },
    })
    expect(next.description).toBe('Neon violet through acid rain')
  })
})
