/**
 * Changing a theme by describing the change.
 *
 * "Try again" throws a design away and rolls a new one. Almost nothing is
 * wrong with a theme in a way that calls for that — the rain is right but too
 * grey, the warnings shout as loudly as the errors. This is the other verb.
 *
 * Two properties make it safe to press repeatedly:
 *
 * **Omission means unchanged.** `colors` is a delta merged over the draft and
 * an absent `scene` leaves the animation alone, so a request about one thing
 * cannot quietly rewrite the rest. That is enforced by the merge, not by the
 * schema — a stage-scoped tool would have to answer "brighter greens" typed on
 * the backdrop view with a shrug.
 *
 * **Nothing is silent.** Whatever moved is named back to the user, and the
 * previous draft is one keypress away. There is deliberately no cap on how
 * much a refinement may touch: a limit would discard a correct answer with no
 * way to tell it had happened.
 */

import type { SceneConfig } from '../../scene/types.js'
import {
  parseThemeFile,
  serializeSceneConfig,
  type ThemeWarning,
} from '../schema.js'
import { describeIssue, validateThemeColors } from '../validate.js'
import { callThemeTool, type ThemeTool } from './call.js'
import { normalizeThemeColors } from './parseResponse.js'
import {
  buildRefineSystemPrompt,
  buildRefineUserPrompt,
  type RefineStage,
} from './prompt.js'
import { buildSceneToolSchema } from './sceneToolSchema.js'

/** A theme mid-design: registered and previewed, not yet on disk. */
export type ThemeDraft = {
  name: string
  mode: 'dark' | 'light'
  description?: string
  /** Complete and validated — every slot, not just the authored ones. */
  colors: Record<string, string>
  scene?: SceneConfig
  warnings: ThemeWarning[]
}

/** What a refinement actually did, for the line shown back to the user. */
export type RefineChange = {
  /** Slots whose value moved. Not the ones the model merely echoed. */
  changedSlots: string[]
  sceneChanged: boolean
  /** True when nothing moved at all — the draft should not be pushed. */
  noop: boolean
  /** The model's own one-line summary. */
  note: string
}

export type RefineResult =
  | { ok: true; draft: ThemeDraft; change: RefineChange }
  | { ok: false; error: string }

export const REFINE_THEME_TOOL: ThemeTool = {
  name: 'refine_theme',
  description: 'Adjust an existing Claude Code theme',
  input_schema: {
    type: 'object' as const,
    properties: {
      note: {
        type: 'string',
        description:
          'One short line in plain language saying what you changed, shown to the user',
      },
      colors: {
        type: 'object',
        description:
          'Only the slots whose values are changing. Omitted slots keep their current value.',
        additionalProperties: { type: 'string' },
      },
      scene: buildSceneToolSchema(),
    },
    // Deliberately just `note`. An empty `required` is dropped by Gemini's
    // schema sanitiser, and a required `colors` would force a palette edit on
    // a request that is purely about the animation.
    required: ['note'],
  },
}

/** What the model sent back, before we decide any of it is usable. */
type RawRefinement = {
  note?: unknown
  colors?: unknown
  scene?: unknown
}

/**
 * Folds a refinement into a draft. Pure — this is where the guarantees live.
 *
 * Reuses `parseThemeFile` by wrapping the response in the envelope it expects
 * (it hard-rejects anything without `mode` and `colors`). That buys rgb
 * normalisation, unknown-slot dropping against the live slot list, non-string
 * value rejection, and the whole scene clamp-and-repair path — none of which
 * should exist twice.
 *
 * It must NOT go on to call `resolveThemeColors`, which fills missing slots
 * from the built-in palette. On a first generation that is exactly right; here
 * it would silently reset all sixty-odd slots the refinement did not mention.
 */
export function mergeRefinement(
  draft: ThemeDraft,
  raw: unknown,
): { draft: ThemeDraft; change: RefineChange } {
  const payload = (raw ?? {}) as RawRefinement
  const note = typeof payload.note === 'string' ? payload.note.trim() : ''

  const parsed = parseThemeFile(
    normalizeThemeColors({
      mode: draft.mode,
      colors: payload.colors ?? {},
      ...(payload.scene !== undefined ? { scene: payload.scene } : {}),
    }),
    draft.name,
  )

  // parseThemeFile only hard-rejects a malformed envelope, and we build the
  // envelope ourselves — so this is unreachable in practice. Treat it as "the
  // model sent nothing usable" rather than throwing.
  if (!parsed.ok) {
    return {
      draft,
      change: { changedSlots: [], sceneChanged: false, noop: true, note },
    }
  }

  const changedSlots = Object.keys(parsed.theme.colors)
    .filter(slot => parsed.theme.colors[slot] !== draft.colors[slot])
    .sort()

  // An omitted scene means unchanged. A present one replaces wholesale: layers
  // are ordered and a partial list would silently drop the rest, so the prompt
  // asks for the complete animation whenever it changes at all.
  const sceneChanged =
    parsed.theme.scene !== undefined &&
    JSON.stringify(parsed.theme.scene) !== JSON.stringify(draft.scene)
  const scene = parsed.theme.scene ?? draft.scene

  if (changedSlots.length === 0 && !sceneChanged) {
    return {
      draft,
      change: { changedSlots: [], sceneChanged: false, noop: true, note },
    }
  }

  // Validation runs over the merged palette, not the delta: contrast is a
  // relationship, and a slot is only unreadable next to the others.
  const merged = { ...draft.colors, ...parsed.theme.colors }
  const { colors, issues } = validateThemeColors(merged, draft.mode)

  const warnings: ThemeWarning[] = [
    ...parsed.warnings,
    ...issues.map(issue => ({
      type: 'colour_issue' as const,
      severity:
        issue.kind === 'repaired-contrast'
          ? ('warning' as const)
          : ('error' as const),
      theme: draft.name,
      message: describeIssue(issue),
    })),
  ]

  const next: ThemeDraft = {
    name: draft.name,
    mode: draft.mode,
    colors,
    warnings,
  }
  if (draft.description !== undefined) next.description = draft.description
  if (scene !== undefined) next.scene = scene

  return {
    draft: next,
    change: { changedSlots, sceneChanged, noop: false, note },
  }
}

/** Asks the model for one change and folds it in. Never throws. */
export async function refineTheme(
  request: {
    draft: ThemeDraft
    instruction: string
    history: readonly string[]
    stage: RefineStage
  },
  signal: AbortSignal,
): Promise<RefineResult> {
  const { draft } = request
  const call = await callThemeTool({
    system: buildRefineSystemPrompt(request.stage),
    user: buildRefineUserPrompt({
      name: draft.name,
      mode: draft.mode,
      colors: draft.colors,
      scene: serialiseSceneForPrompt(draft.scene),
      instruction: request.instruction,
      history: request.history,
      stage: request.stage,
    }),
    tool: REFINE_THEME_TOOL,
    querySource: 'theme_refine',
    signal,
  })
  if (!call.ok) {
    return { ok: false, error: call.error }
  }

  const { draft: next, change } = mergeRefinement(draft, call.input)
  return { ok: true, draft: next, change }
}

/**
 * The scene as the model should see it: the file shape, not the in-memory one.
 *
 * Sprite frames are `{frames, width, height}` once parsed, and showing the
 * model a shape it cannot send back would invite it to echo the wrong thing.
 */
function serialiseSceneForPrompt(scene: SceneConfig | undefined): unknown {
  return serializeSceneConfig(scene ?? { kind: 'none' })
}
