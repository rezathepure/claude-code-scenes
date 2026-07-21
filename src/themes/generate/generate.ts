/**
 * Generates a theme from a description by asking the model for one.
 *
 * Uses a **forced tool call** rather than `output_format`. That is not a
 * stylistic preference: sideQuery branches to the OpenAI/Grok/Gemini adapters
 * before `output_format` is ever read (src/utils/sideQuery.ts:190-196), and
 * neither adapter forwards it — so on any non-Anthropic provider the flag is
 * silently dropped, the model replies in prose, and parsing fails. Forced tool
 * calls are converted by every adapter, so the same code path works for all
 * four providers and needs no beta header.
 *
 * The response is deliberately allowed to be partial. resolveThemeColors fills
 * anything missing from the built-in for the declared mode and
 * validateThemeColors repairs what is unreadable, so a model that produces
 * thirty good colours instead of seventy still yields a coherent theme. That
 * turns the most common failure mode into a non-event.
 */

import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { isPoorModeActive } from '../../commands/poor/poorMode.js'
import type { SceneConfig } from '../../scene/types.js'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import { getMainLoopModel, getSmallFastModel } from '../../utils/model/model.js'
import { sideQuery } from '../../utils/sideQuery.js'
import { resolveThemeColors } from '../loader.js'
import { parseThemeFile, type ThemeWarning } from '../schema.js'
import { validateThemeColors, describeIssue } from '../validate.js'
import { extractJsonObject, normalizeThemeColors } from './parseResponse.js'
import {
  buildThemeSystemPrompt,
  buildThemeUserPrompt,
  type GenerationRequest,
} from './prompt.js'

const CREATE_THEME_TOOL = {
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
      scene: {
        type: 'object',
        description:
          'Animated background matched to the mood: kind "rain" (falling glyph streams), "petals" (drifting particles) or "none" (still). params.intensity 0.15-1 is the opacity of the effect; 0.55 reads as a quiet backdrop.',
        properties: {
          kind: { type: 'string', enum: ['none', 'rain', 'petals'] },
          params: {
            type: 'object',
            description:
              'Optional numeric overrides, e.g. {"intensity": 0.55}. Omitted values get defaults; out-of-range values are clamped.',
            additionalProperties: { type: 'number' },
          },
        },
        required: ['kind'],
      },
    },
    required: ['mode', 'colors'],
  },
}

/**
 * Body text is the largest single cost — a full palette is roughly 70 slots of
 * ~10 tokens each plus JSON structure. 4096 leaves comfortable headroom
 * without inviting the model to pad.
 */
const MAX_TOKENS = 4096

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
 * Pulls the theme object out of a response, whichever way the model framed it.
 *
 * The forced tool call should always produce a tool_use block, but the
 * compatibility adapters reconstruct those from provider-specific shapes and a
 * model can still answer in prose. Falling back to text extraction costs a few
 * lines and turns a hard failure into a soft one.
 */
function extractThemeObject(response: BetaMessage): unknown | null {
  const toolUse = response.content.find(block => block.type === 'tool_use')
  if (toolUse && toolUse.type === 'tool_use') {
    return toolUse.input
  }

  const text = response.content.find(block => block.type === 'text')
  if (text && text.type === 'text') {
    const extracted = extractJsonObject(text.text)
    if (extracted.ok) {
      return extracted.value
    }
  }

  return null
}

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
  // Follows permissionExplainer, the only other user-initiated side query:
  // poor mode downgrades the model rather than skipping the feature, because
  // the user explicitly asked for this. Automatic background queries skip;
  // this is not one.
  const model = isPoorModeActive() ? getSmallFastModel() : getMainLoopModel()

  let response: BetaMessage
  try {
    response = await sideQuery({
      model,
      system: buildThemeSystemPrompt(),
      skipSystemPromptPrefix: true,
      messages: [{ role: 'user', content: buildThemeUserPrompt(request) }],
      tools: [CREATE_THEME_TOOL],
      tool_choice: { type: 'tool', name: CREATE_THEME_TOOL.name },
      max_tokens: MAX_TOKENS,
      signal,
      querySource: 'theme_create',
    })
  } catch (error) {
    if (signal.aborted) {
      return { ok: false, error: 'Cancelled.' }
    }
    logForDebugging(`[themes] Generation failed: ${errorMessage(error)}`, {
      level: 'warn',
    })
    return {
      ok: false,
      error: `Could not reach the model: ${errorMessage(error)}`,
    }
  }

  const raw = extractThemeObject(response)
  if (raw === null) {
    return {
      ok: false,
      error:
        'The model did not return a theme. Try rephrasing the description.',
    }
  }

  // Same three-tier parse a hand-written file goes through: unknown slots are
  // dropped with a warning rather than trusted, mirroring how
  // findRelevantMemories re-checks names against a known-good set instead of
  // relying on the schema.
  const parsed = parseThemeFile(normalizeThemeColors(raw), request.name)
  if (!parsed.ok) {
    const detail = parsed.warnings[0]?.message ?? 'unrecognised shape'
    return { ok: false, error: `The model's theme was unusable: ${detail}` }
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
