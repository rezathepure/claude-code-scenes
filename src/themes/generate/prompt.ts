/**
 * Builds the prompt that turns a vibe into a palette.
 *
 * Three things go in, in descending order of leverage:
 *
 *  1. **What the slots mean.** A model that misreads a slot produces a theme
 *     that is wrong in ways validation cannot detect. See slotDocs.ts.
 *  2. **The discipline.** Both reference themes follow the same rules, and
 *     stating them is what stops a generated theme becoming 71 unrelated
 *     colours.
 *  3. **Worked examples.** Matrix and Sakura, quoted from the files that
 *     actually ship, so the examples can never drift from reality.
 *
 * The output is asked for as a theme file — the same shape a user would hand
 * write — so generation and hand editing stay the same format, and a generated
 * theme can be opened and tweaked afterwards.
 */

import matrix from '../bundled/matrix.json'
import sakura from '../bundled/sakura.json'
import { getKnownSlotNames } from '../schema.js'
import { KEY_SLOT_DOCS, SLOT_FAMILIES, THEME_DISCIPLINE } from './slotDocs.js'

function renderSlotDocs(): string {
  const lines: string[] = []
  for (const doc of KEY_SLOT_DOCS) {
    lines.push(`- \`${doc.slot}\` — ${doc.describes}`)
    if (doc.caution) {
      lines.push(`    ! ${doc.caution}`)
    }
  }
  return lines.join('\n')
}

function renderFamilies(): string {
  return SLOT_FAMILIES.map(
    f =>
      `- ${f.prefixOrNames.map(p => `\`${p}\``).join(', ')} — ${f.instruction}`,
  ).join('\n')
}

function renderRemainingSlots(): string {
  const documented = new Set(KEY_SLOT_DOCS.map(d => d.slot))
  const familyMatch = (slot: string): boolean =>
    SLOT_FAMILIES.some(f =>
      f.prefixOrNames.some(p => slot.includes(p) || slot === p),
    )

  const rest = getKnownSlotNames().filter(
    s => !documented.has(s) && !familyMatch(s),
  )
  return rest.length > 0 ? rest.map(s => `\`${s}\``).join(', ') : '(none)'
}

/**
 * Trims an example down to the slots that teach something.
 *
 * The full files include background fills and mode indicators whose values are
 * mechanical once the palette is chosen; including them triples the example
 * size while teaching nothing.
 */
function exampleColors(theme: {
  colors: Record<string, string>
}): Record<string, string> {
  const teaching = [
    'text',
    'inactive',
    'subtle',
    'claude',
    'claudeShimmer',
    'success',
    'error',
    'warning',
    'suggestion',
    'remember',
    'diffAdded',
    'diffRemoved',
  ]
  const out: Record<string, string> = {}
  for (const slot of teaching) {
    const value = theme.colors[slot]
    if (value) out[slot] = value
  }
  return out
}

// Structural rather than `typeof matrix`: the two bundled JSON files infer
// different literal shapes (matrix tunes scene params, sakura does not), and
// only these three fields matter to the prompt anyway.
function renderExample(
  name: string,
  theme: { mode: string; description: string; colors: Record<string, string> },
): string {
  return [
    `### ${name} — "${theme.description}"`,
    '```json',
    JSON.stringify(
      {
        mode: theme.mode,
        description: theme.description,
        colors: exampleColors(theme),
      },
      null,
      2,
    ),
    '```',
  ].join('\n')
}

export type GenerationRequest = {
  /** What the user asked for, verbatim. */
  vibe: string
  /** Suggested filename stem, already checked for collisions. */
  name: string
}

/**
 * The instruction half of the prompt — everything except the user's vibe.
 * Split out so it can be cached and tested independently.
 */
export function buildThemeSystemPrompt(): string {
  return `You design colour themes for Claude Code, a terminal coding assistant.

You will be given a short description of a mood, brand or idea, and must
produce a complete colour theme that evokes it while remaining usable for
hours of real work.

## How the theme is rendered

Colours are painted as terminal text. There is no page background: text is
drawn directly onto whatever background the user's terminal already has. You
declare \`mode\` to say which you are designing for — "dark" or "light" — and
every colour is judged against that.

Values may be written as \`rgb(r,g,b)\`, \`#rrggbb\`, \`ansi256(n)\` or
\`ansi:<name>\`. Prefer \`rgb(r,g,b)\`. Do not put more than one space after a
comma; \`rgb(1, 2, 3)\` is fine, \`rgb(1,  2,  3)\` will not render.

## Design discipline

${THEME_DISCIPLINE.map(d => `- ${d}`).join('\n')}

## What each slot controls

${renderSlotDocs()}

### Families

${renderFamilies()}

### Remaining slots

Set these to something coherent with the palette; they appear in narrow
contexts: ${renderRemainingSlots()}

## Hard requirements

- \`text\` must be strongly readable against the terminal background implied by
  \`mode\`. This is body copy.
- \`error\`, \`warning\` and \`success\` must be tellable apart at a glance.
- Slots documented as background fills must stay dim enough that text drawn on
  top of them remains readable.
- Do not invent slot names. Anything unrecognised is discarded.

## Worked examples

These are two themes that ship with Claude Code. Note how each picks one
signature hue, gives tools a cooler accent, spends one warm hue, and keeps red
for failure — the same discipline applied to completely different moods.

${renderExample('matrix', matrix)}

${renderExample('sakura', sakura)}

## Output

Return a single JSON object of the same shape: \`mode\`, a one-line
\`description\`, and \`colors\`. Specify every slot you can; any you omit will
be filled from the built-in theme for your chosen mode, which will look
out of place if you leave out something central.`
}

/** The user half: what they asked for, and what the theme will be called. */
export function buildThemeUserPrompt(request: GenerationRequest): string {
  return `Design a theme called "${request.name}".

The user asked for: ${request.vibe}

Return only the JSON object.`
}
