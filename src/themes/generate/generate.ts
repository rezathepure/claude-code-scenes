/**
 * Generates a theme from a description by asking the model for one.
 *
 * The call itself — forced tool, single user turn, token ceiling, truncation
 * reporting — lives in call.ts, shared with refinement. See that file for why
 * each of those is not negotiable.
 *
 * The response is deliberately allowed to be partial. resolveThemeColors fills
 * anything missing from the built-in for the declared mode and
 * validateThemeColors repairs what is unreadable, so a model that produces
 * thirty good colours instead of seventy still yields a coherent theme. That
 * turns the most common failure mode into a non-event.
 *
 * This is the ONE place resolveThemeColors is correct. A refinement must never
 * call it: filling from the built-in would wipe every slot the draft already
 * has. See mergeRefinement in refine.ts.
 */

import type { SceneConfig } from '../../scene/types.js'
import { resolveThemeColors } from '../loader.js'
import { parseThemeFile, type ThemeWarning } from '../schema.js'
import { validateThemeColors, describeIssue } from '../validate.js'
import { callThemeTool, type ThemeTool } from './call.js'
import { normalizeThemeColors } from './parseResponse.js'
import {
  buildThemeSystemPrompt,
  buildThemeUserPrompt,
  type GenerationRequest,
} from './prompt.js'
import { buildSceneToolSchema } from './sceneToolSchema.js'

const CREATE_THEME_TOOL: ThemeTool = {
  name: 'create_theme',
  description: 'Return a complete colour theme for Claude Code',
  input_schema: {
    type: 'object' as const,
    properties: {
      mode: {
        type: 'string',
        enum: ['dark', 'light'],
        description:
          'Whether this theme is designed for a dark or light terminal background',
      },
      description: {
        type: 'string',
        description: 'One line describing the theme, shown in the theme picker',
      },
      colors: {
        type: 'object',
        description:
          'Map of slot name to colour value. Prefer rgb(r,g,b). Set as many slots as you can; omitted slots are filled from the built-in theme.',
        additionalProperties: { type: 'string' },
      },
      scene: buildSceneToolSchema(),
    },
    required: ['mode', 'colors'],
  },
}

export type GenerationResult =
  | {
      ok: true
      /** Complete, validated, repaired palette, ready to register. */
      colors: Record<string, string>
      mode: 'dark' | 'light'
      description?: string
      /** Animated background, already clamped by the schema parse. */
      scene?: SceneConfig
      /** How many slots the model actually set, before backfilling. */
      authoredSlotCount: number
      /** Anything the author should know: repairs, dropped slots, clashes. */
      warnings: ThemeWarning[]
    }
  | { ok: false; error: string }

/**
 * Asks the model for a theme and returns a palette ready to register.
 *
 * Never throws: a user typing `/theme create` should get an explanation, not a
 * stack trace.
 */
export async function generateTheme(
  request: GenerationRequest,
  signal: AbortSignal,
): Promise<GenerationResult> {
  const call = await callThemeTool({
    system: buildThemeSystemPrompt(),
    user: buildThemeUserPrompt(request),
    tool: CREATE_THEME_TOOL,
    querySource: 'theme_create',
    signal,
  })
  if (!call.ok) {
    return { ok: false, error: call.error }
  }

  // Same three-tier parse a hand-written file goes through: unknown slots are
  // dropped with a warning rather than trusted, mirroring how
  // findRelevantMemories re-checks names against a known-good set instead of
  // relying on the schema.
  const parsed = parseThemeFile(normalizeThemeColors(call.input), request.name)
  if (!parsed.ok) {
    const detail = parsed.warnings[0]?.message ?? 'unrecognised shape'
    return {
      ok: false,
      error: `The model's theme was unusable: ${detail}`,
    }
  }

  const authoredSlotCount = Object.keys(parsed.theme.colors).length
  const resolved = resolveThemeColors(parsed.theme)
  const { colors, issues } = validateThemeColors(resolved, parsed.theme.mode)

  const warnings: ThemeWarning[] = [
    ...parsed.warnings,
    ...issues.map(issue => ({
      type: 'colour_issue' as const,
      severity:
        issue.kind === 'repaired-contrast'
          ? ('warning' as const)
          : ('error' as const),
      theme: request.name,
      message: describeIssue(issue),
    })),
  ]

  const result: GenerationResult = {
    ok: true,
    colors,
    mode: parsed.theme.mode,
    authoredSlotCount,
    warnings,
  }
  if (parsed.theme.description !== undefined) {
    result.description = parsed.theme.description
  }
  // parseThemeFile has already filled defaults and clamped ranges, so this is
  // a complete, safe config — the same guarantee a hand-written file gets.
  if (parsed.theme.scene !== undefined) {
    result.scene = parsed.theme.scene
  }
  return result
}
