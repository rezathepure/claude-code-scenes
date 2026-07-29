/**
 * The create-a-theme state machine.
 *
 * The bookkeeping here is what makes refinement feel safe: undo always moves
 * something, a failed refinement never costs the draft, and the instruction
 * history stays honest about what was actually applied. None of that is
 * visible from the component, which is why it lives in a reducer.
 */

import { describe, expect, test } from 'bun:test'
import type {
  RefineChange,
  ThemeDraft,
} from '../../../themes/generate/refine.js'
import {
  canUndo,
  creatorReducer,
  currentDraft,
  initialCreatorState,
  type CreatorState,
} from '../creatorState.js'

function draft(claude: string): ThemeDraft {
  return { name: 'test-only', mode: 'dark', colors: { claude }, warnings: [] }
}

function change(slots: string[], noop = false): RefineChange {
  return { changedSlots: slots, sceneChanged: false, noop, note: 'did a thing' }
}

/** A state with one generated draft, sitting on the backdrop view. */
function generated(): CreatorState {
  return creatorReducer(initialCreatorState, {
    type: 'generated',
    draft: draft('a'),
  })
}

/** Applies one refinement, the way the component does: start, then land. */
function refine(
  state: CreatorState,
  instruction: string,
  next: ThemeDraft,
): CreatorState {
  const started = creatorReducer(state, { type: 'refineStarted', instruction })
  return creatorReducer(started, {
    type: 'refined',
    draft: next,
    change: change(['claude']),
  })
}

describe('creatorReducer', () => {
  test('a generated theme opens on the backdrop with nothing to undo', () => {
    const state = generated()
    expect(state.phase).toEqual({ kind: 'review', stage: 'backdrop' })
    expect(currentDraft(state)).toEqual(draft('a'))
    expect(canUndo(state)).toBe(false)
  })

  test('refinements stack, and undo walks back one at a time', () => {
    let state = refine(generated(), 'warmer', draft('b'))
    state = refine(state, 'warmer still', draft('c'))

    expect(currentDraft(state)).toEqual(draft('c'))
    expect(state.instructions).toEqual(['warmer', 'warmer still'])
    expect(canUndo(state)).toBe(true)

    state = creatorReducer(state, { type: 'undo' })
    expect(currentDraft(state)).toEqual(draft('b'))
    // The instruction goes with the draft it produced, so the next refinement
    // is not told about a change that has been undone.
    expect(state.instructions).toEqual(['warmer'])

    state = creatorReducer(state, { type: 'undo' })
    expect(currentDraft(state)).toEqual(draft('a'))
    expect(canUndo(state)).toBe(false)

    // Undo at the bottom is a no-op, not an underflow.
    expect(creatorReducer(state, { type: 'undo' })).toBe(state)
  })

  test('a no-op refinement is reported but not stacked', () => {
    const state = creatorReducer(
      creatorReducer(generated(), {
        type: 'refineStarted',
        instruction: 'nothing doing',
      }),
      { type: 'refineNoop', change: change([], true) },
    )

    expect(state.drafts).toHaveLength(1)
    expect(state.instructions).toEqual([])
    expect(canUndo(state)).toBe(false)
    expect(state.lastChange?.noop).toBe(true)
    expect(state.phase).toEqual({ kind: 'review', stage: 'backdrop' })
  })

  test('a refinement returns to the view it was started from', () => {
    let state = creatorReducer(generated(), {
      type: 'gotoStage',
      stage: 'text',
    })
    state = refine(state, 'calmer warnings', draft('b'))
    expect(state.phase).toEqual({ kind: 'review', stage: 'text' })
  })

  test('cancelling a refinement keeps the draft', () => {
    const started = creatorReducer(generated(), {
      type: 'refineStarted',
      instruction: 'wait no',
    })
    const state = creatorReducer(started, { type: 'refineCancelled' })

    expect(currentDraft(state)).toEqual(draft('a'))
    expect(state.instructions).toEqual([])
    expect(state.phase).toEqual({ kind: 'review', stage: 'backdrop' })
  })

  test('a failed refinement keeps the draft, and Try again returns to it', () => {
    // This is the difference between a failed refinement costing a turn and
    // costing the whole design.
    let state = refine(generated(), 'warmer', draft('b'))
    state = creatorReducer(state, { type: 'gotoStage', stage: 'text' })
    state = creatorReducer(state, {
      type: 'refineStarted',
      instruction: 'louder',
    })
    state = creatorReducer(state, { type: 'refineFailed', error: 'network' })

    expect(state.phase).toEqual({
      kind: 'failed',
      error: 'network',
      from: 'refine',
      stage: 'text',
    })
    expect(currentDraft(state)).toEqual(draft('b'))

    state = creatorReducer(state, { type: 'retry' })
    expect(state.phase).toEqual({ kind: 'review', stage: 'text' })
    expect(currentDraft(state)).toEqual(draft('b'))
  })

  test('a failed generation has nothing to keep, so Try again starts over', () => {
    let state = creatorReducer(initialCreatorState, {
      type: 'generateFailed',
      error: 'nope',
    })
    expect(state.phase).toEqual({
      kind: 'failed',
      error: 'nope',
      from: 'generate',
      stage: 'backdrop',
    })

    state = creatorReducer(state, { type: 'retry' })
    expect(state).toEqual(initialCreatorState)
  })

  test('instructions stay parallel to the drafts they produced', () => {
    let state = refine(generated(), 'one', draft('b'))
    state = refine(state, 'two', draft('c'))
    state = creatorReducer(
      creatorReducer(state, { type: 'refineStarted', instruction: 'three' }),
      { type: 'refineNoop', change: change([], true) },
    )
    state = refine(state, 'four', draft('d'))

    // Three landed, one did not — and the history is the three that did.
    expect(state.drafts).toHaveLength(4)
    expect(state.instructions).toEqual(['one', 'two', 'four'])
    expect(state.instructions).toHaveLength(state.drafts.length - 1)
  })
})
