/**
 * The create-a-theme flow as a pure function.
 *
 * Kept out of the component because the interesting parts are all
 * bookkeeping — which draft is current, what may be undone, whether a failure
 * came from generating or refining and therefore where "Try again" goes — and
 * bookkeeping is exactly what a React component makes hard to check.
 *
 * The two views (backdrop and text) are peers rather than wizard steps. They
 * edit one draft, either can be left at any time, and Keep is reachable from
 * both, so there is no step index and no notion of progress.
 */

import type { RefineChange, ThemeDraft } from '../../themes/generate/refine.js'

/** Which half of the design the user is looking at. */
export type Stage = 'backdrop' | 'text'

export type CreatorPhase =
  | { kind: 'generating' }
  | { kind: 'refining'; stage: Stage; instruction: string }
  | { kind: 'review'; stage: Stage }
  /** `stage` is where a failed refinement came from, so Try again returns there. */
  | { kind: 'failed'; error: string; from: 'generate' | 'refine'; stage: Stage }

export type CreatorState = {
  phase: CreatorPhase
  /**
   * Every draft, oldest first. The last is current; the rest are the undo
   * stack. A no-op refinement never pushes, so undo always moves something.
   */
  drafts: ThemeDraft[]
  /** Instructions given, in order. Parallel to drafts[1..]. */
  instructions: string[]
  /** What the last refinement did, for the line shown above the input. */
  lastChange: RefineChange | null
}

export type CreatorAction =
  | { type: 'generated'; draft: ThemeDraft }
  | { type: 'generateFailed'; error: string }
  | { type: 'refineStarted'; instruction: string }
  | { type: 'refined'; draft: ThemeDraft; change: RefineChange }
  | { type: 'refineNoop'; change: RefineChange }
  | { type: 'refineFailed'; error: string }
  | { type: 'refineCancelled' }
  | { type: 'gotoStage'; stage: Stage }
  | { type: 'undo' }
  | { type: 'retry' }

export const initialCreatorState: CreatorState = {
  phase: { kind: 'generating' },
  drafts: [],
  instructions: [],
  lastChange: null,
}

/** The draft being previewed, or null before the first generation lands. */
export function currentDraft(state: CreatorState): ThemeDraft | null {
  return state.drafts[state.drafts.length - 1] ?? null
}

export function canUndo(state: CreatorState): boolean {
  return state.drafts.length > 1
}

/** The stage in view, or the one to return to after a refinement. */
function stageOf(phase: CreatorPhase): Stage {
  return phase.kind === 'review' || phase.kind === 'refining'
    ? phase.stage
    : 'backdrop'
}

export function creatorReducer(
  state: CreatorState,
  action: CreatorAction,
): CreatorState {
  switch (action.type) {
    case 'generated':
      // The backdrop leads: it is the part of a theme that reads at a glance,
      // and the part a description most often gets wrong.
      return {
        phase: { kind: 'review', stage: 'backdrop' },
        drafts: [action.draft],
        instructions: [],
        lastChange: null,
      }

    case 'generateFailed':
      return {
        ...state,
        phase: {
          kind: 'failed',
          error: action.error,
          from: 'generate',
          stage: 'backdrop',
        },
      }

    case 'refineStarted':
      return {
        ...state,
        phase: {
          kind: 'refining',
          stage: stageOf(state.phase),
          instruction: action.instruction,
        },
      }

    case 'refined':
      return {
        phase: { kind: 'review', stage: stageOf(state.phase) },
        drafts: [...state.drafts, action.draft],
        instructions: [
          ...state.instructions,
          state.phase.kind === 'refining' ? state.phase.instruction : '',
        ],
        lastChange: action.change,
      }

    case 'refineNoop':
      // Nothing moved, so nothing is pushed: an undo entry that undoes nothing
      // is worse than no entry, and the instruction was not acted on so it is
      // not part of the history the next refinement is told about.
      return {
        ...state,
        phase: { kind: 'review', stage: stageOf(state.phase) },
        lastChange: action.change,
      }

    case 'refineFailed':
      return {
        ...state,
        phase: {
          kind: 'failed',
          error: action.error,
          from: 'refine',
          stage: stageOf(state.phase),
        },
      }

    case 'refineCancelled':
      return {
        ...state,
        phase: { kind: 'review', stage: stageOf(state.phase) },
      }

    case 'gotoStage':
      return { ...state, phase: { kind: 'review', stage: action.stage } }

    case 'undo': {
      if (!canUndo(state)) return state
      return {
        ...state,
        phase: { kind: 'review', stage: stageOf(state.phase) },
        drafts: state.drafts.slice(0, -1),
        instructions: state.instructions.slice(0, -1),
        lastChange: null,
      }
    }

    case 'retry':
      // A failed refinement leaves the draft intact, so "Try again" means go
      // back to it — not regenerate from scratch and lose everything.
      if (state.phase.kind === 'failed' && state.phase.from === 'refine') {
        return {
          ...state,
          phase: { kind: 'review', stage: state.phase.stage },
          lastChange: null,
        }
      }
      return { ...initialCreatorState }
  }
}
