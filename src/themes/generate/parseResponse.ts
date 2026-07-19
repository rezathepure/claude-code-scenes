/**
 * Turns whatever the model actually returned into a theme file.
 *
 * Even asked for "only the JSON object", models wrap output in a markdown
 * fence, add a sentence of preamble, or both. If structured output is
 * available the response arrives clean and this is a no-op; when it is not —
 * notably on the OpenAI/Gemini/Grok compatibility layers, where tool-call
 * support varies — this is the difference between the feature working and not.
 *
 * Deliberately lenient about *packaging* and strict about *content*: anything
 * that yields a JSON object is accepted, and the object itself is then held to
 * the same schema as a hand-written theme file (see schema.parseThemeFile).
 */

export type ExtractOutcome =
  | { ok: true; value: unknown }
  | { ok: false; reason: string }

/**
 * Pulls a JSON object out of a model response.
 *
 * Tries, in order: the whole response, a fenced code block, and finally the
 * span between the first `{` and its matching `}`. The last of those is what
 * rescues "Here's your theme: { ... } Hope you like it!".
 */
export function extractJsonObject(raw: string): ExtractOutcome {
  const text = raw.trim()
  if (text.length === 0) {
    return { ok: false, reason: 'The model returned an empty response.' }
  }

  const attempts: string[] = [text]

  // ```json ... ``` or plain ``` ... ```
  const fence = /```(?:json)?\s*\n?([\s\S]*?)```/.exec(text)
  if (fence?.[1]) {
    attempts.push(fence[1].trim())
  }

  const braced = sliceBalancedObject(text)
  if (braced) {
    attempts.push(braced)
  }

  for (const candidate of attempts) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      // A bare array or string is not a theme, and accepting one here would
      // produce a confusing downstream error instead of a clear one.
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return { ok: true, value: parsed }
      }
    } catch {
      // Try the next framing.
    }
  }

  return {
    ok: false,
    reason: 'The model did not return a JSON object.',
  }
}

/**
 * Returns the substring from the first `{` to its matching `}`, or null.
 *
 * Counts braces rather than regex-matching, so nested objects survive — a
 * theme is `{ colors: { ... } }`, so a non-greedy match would stop at the
 * wrong place and a greedy one would swallow trailing prose.
 *
 * String literals are skipped so a `}` inside a description does not end the
 * object early.
 */
function sliceBalancedObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]!

    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      if (inString) escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  return null
}

/**
 * Normalises colour values the model is likely to get slightly wrong.
 *
 * Only fixes things that are unambiguous in intent and would otherwise render
 * as uncoloured text. Anything genuinely ambiguous is left alone for
 * validation to report, because guessing at a colour the author did not write
 * is worse than telling them it was rejected.
 */
export function normalizeColorValue(value: string): string {
  let out = value.trim()

  // `rgb(1,  2,  3)` — the renderer accepts at most one space after a comma,
  // and the prompt says so, but models emit pretty-printed spacing anyway.
  // The intent is not in doubt.
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(out)
  if (rgb) {
    return `rgb(${rgb[1]},${rgb[2]},${rgb[3]})`
  }

  // `#ABCDEF` -> lowercase; the parser is case-insensitive but files read
  // better consistent, and generated themes are meant to be hand-edited.
  if (/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(out)) {
    out = out.toLowerCase()
  }

  return out
}

/**
 * Applies normalisation across a theme-shaped object's `colors` map.
 *
 * Non-string values are passed through untouched so schema validation can
 * report them properly rather than having them stringified here.
 */
export function normalizeThemeColors(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value
  }

  const obj = value as Record<string, unknown>
  const colors = obj.colors
  if (typeof colors !== 'object' || colors === null || Array.isArray(colors)) {
    return value
  }

  const normalized: Record<string, unknown> = {}
  for (const [slot, raw] of Object.entries(colors as Record<string, unknown>)) {
    normalized[slot] = typeof raw === 'string' ? normalizeColorValue(raw) : raw
  }

  return { ...obj, colors: normalized }
}
