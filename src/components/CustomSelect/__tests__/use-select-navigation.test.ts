import { describe, expect, test } from 'bun:test'
import { resolveFocusAfterOptionsChange } from '../use-select-navigation.js'

// The theme creator's refinement menu, which is where this surfaced.
const MENU = [
  { value: 'refine' },
  { value: 'text' },
  { value: 'undo' },
  { value: 'keep' },
  { value: 'discard' },
]

describe('resolveFocusAfterOptionsChange', () => {
  test('keeps where the user navigated to, ignoring defaultFocusValue', () => {
    // The reported bug: arrow down to "Text colours", and a moment later focus
    // jumps back to the first entry. Options are rebuilt on every parent
    // render, and behind this menu an animated backdrop repaints constantly,
    // so "a moment later" was the very next frame.
    expect(
      resolveFocusAfterOptionsChange({
        currentFocus: 'text',
        options: MENU,
        focusValue: 'refine',
      }),
    ).toBe('text')
  })

  test('falls back to defaultFocusValue when the focused option is gone', () => {
    // "Undo" disappears once there is nothing left to undo.
    expect(
      resolveFocusAfterOptionsChange({
        currentFocus: 'undo',
        options: MENU.filter(o => o.value !== 'undo'),
        focusValue: 'refine',
      }),
    ).toBe('refine')
  })

  test('falls back when nothing is focused yet', () => {
    expect(
      resolveFocusAfterOptionsChange({
        currentFocus: undefined,
        options: MENU,
        focusValue: 'refine',
      }),
    ).toBe('refine')
  })

  test('prefers focusValue over initialFocusValue when falling back', () => {
    expect(
      resolveFocusAfterOptionsChange({
        currentFocus: undefined,
        options: MENU,
        focusValue: 'keep',
        initialFocusValue: 'discard',
      }),
    ).toBe('keep')
  })

  test('uses initialFocusValue when there is no focusValue', () => {
    expect(
      resolveFocusAfterOptionsChange({
        currentFocus: undefined,
        options: MENU,
        initialFocusValue: 'discard',
      }),
    ).toBe('discard')
  })

  test('returns undefined when there is nothing to fall back to', () => {
    // createDefaultState then focuses the first option, which is the sane
    // outcome for a menu whose focused entry vanished.
    expect(
      resolveFocusAfterOptionsChange({ currentFocus: 'gone', options: MENU }),
    ).toBeUndefined()
  })

  test('works for non-string values', () => {
    expect(
      resolveFocusAfterOptionsChange({
        currentFocus: 2,
        options: [{ value: 1 }, { value: 2 }],
        focusValue: 1,
      }),
    ).toBe(2)
  })
})
