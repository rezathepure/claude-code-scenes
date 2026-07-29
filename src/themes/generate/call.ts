/**
 * The one way this module talks to a model.
 *
 * Shared by the first generation and every refinement, because everything
 * awkward about the call is the same for both.
 *
 * **Forced tool call, never `output_format`.** sideQuery branches to the
 * OpenAI/Grok/Gemini adapters before `output_format` is read and none of them
 * forwards it, so on any non-Anthropic provider the flag is silently dropped,
 * the model answers in prose, and parsing fails. Forced tool calls are
 * converted by every adapter.
 *
 * **One user turn, always.** It is tempting to hold a conversation for
 * refinement — append the assistant's tool_use, add "now make it warmer" — and
 * it would work on Anthropic. It would silently break everywhere else:
 * `messageParamsToOpenAIRoleContent` and the Gemini path both keep only
 * `type: 'text'` blocks and skip a message that ends up empty, so an assistant
 * turn that is a lone tool_use vanishes and the follow-up arrives with no
 * antecedent. The current theme is therefore embedded in the user turn instead
 * of being remembered, which also makes undo a matter of keeping old state
 * rather than rewinding a transcript.
 */

import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { isPoorModeActive } from '../../commands/poor/poorMode.js'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import { getMainLoopModel, getSmallFastModel } from '../../utils/model/model.js'
import { sideQuery } from '../../utils/sideQuery.js'
import { extractJsonObject } from './parseResponse.js'

/**
 * Body text is the largest single cost — a full palette is roughly 70 slots of
 * ~10 tokens each plus JSON structure, so ~1k tokens of actual payload.
 *
 * The ceiling is set far above that on purpose. Truncation is the one failure
 * this module cannot degrade gracefully: every other problem (unknown slots,
 * missing slots, out-of-range params, prose instead of a tool call) is
 * repaired or backfilled, but a tool_use block cut off mid-object yields
 * unparseable input and the whole generation is lost. Since output tokens are
 * only billed for what is actually produced, headroom is nearly free — and a
 * reasoning model that thinks before emitting the palette spends from the same
 * budget, which is what made the old 4096 tight.
 *
 * Capped at 16384 rather than higher because sideQuery forwards `max_tokens`
 * to the OpenAI/Gemini/Grok adapters unclamped, and several of those endpoints
 * reject a value above the model's own output ceiling with a hard 400. 16384
 * clears every first-party Claude model and sits exactly at the common
 * compat-layer ceiling, so headroom never costs availability.
 */
const MAX_TOKENS = 16384

export type ThemeTool = {
  name: string
  description: string
  /**
   * `type: 'object'` is required by the SDK's tool type, and the rest is
   * deliberately loose — the scene schema is generated from the grammar tables
   * and describing it structurally here would be a second copy that drifts.
   */
  input_schema: { type: 'object' } & Record<string, unknown>
}

export type ToolCallOutcome =
  | { ok: true; input: unknown }
  | { ok: false; error: string; truncated: boolean }

/**
 * Pulls the tool input out of a response, whichever way the model framed it.
 *
 * The forced tool call should always produce a tool_use block, but the
 * compatibility adapters reconstruct those from provider-specific shapes and a
 * model can still answer in prose. Falling back to text extraction costs a few
 * lines and turns a hard failure into a soft one.
 */
function extractToolInput(response: BetaMessage): unknown | null {
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

/** Asks the model for one forced tool call. Never throws. */
export async function callThemeTool(opts: {
  system: string
  user: string
  tool: ThemeTool
  querySource: string
  signal: AbortSignal
}): Promise<ToolCallOutcome> {
  // Follows permissionExplainer, the only other user-initiated side query:
  // poor mode downgrades the model rather than skipping the feature, because
  // the user explicitly asked for this. Automatic background queries skip;
  // this is not one.
  const model = isPoorModeActive() ? getSmallFastModel() : getMainLoopModel()

  let response: BetaMessage
  try {
    response = await sideQuery({
      model,
      system: opts.system,
      skipSystemPromptPrefix: true,
      messages: [{ role: 'user', content: opts.user }],
      tools: [opts.tool],
      tool_choice: { type: 'tool', name: opts.tool.name },
      max_tokens: MAX_TOKENS,
      signal: opts.signal,
      querySource: opts.querySource,
    })
  } catch (error) {
    if (opts.signal.aborted) {
      return { ok: false, error: 'Cancelled.', truncated: false }
    }
    logForDebugging(
      `[themes] ${opts.querySource} failed: ${errorMessage(error)}`,
      {
        level: 'warn',
      },
    )
    return {
      ok: false,
      error: `Could not reach the model: ${errorMessage(error)}`,
      truncated: false,
    }
  }

  // Truncation is reported before parsing, because a cut-off tool_use block
  // fails in exactly the same way as a model that ignored the tool — and
  // "rephrase your description" is useless advice for a length problem.
  const truncated = response.stop_reason === 'max_tokens'
  const input = extractToolInput(response)
  if (input === null) {
    return {
      ok: false,
      truncated,
      error: truncated
        ? `The model ran out of room before it finished (hit the ${MAX_TOKENS}-token limit). Try asking for less at once.`
        : 'The model did not answer with a theme. Try rephrasing.',
    }
  }

  return { ok: true, input }
}
