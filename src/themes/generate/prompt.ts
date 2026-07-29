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

import { FUNCTIONS } from '../../scene/expr/index.js'
import { GLYPH_CATALOG_NAMES, glyphCatalog } from '../../scene/glyphs.js'
import {
  FADE_MODES,
  FIELD_PARAMS,
  MAX_FIELDS,
  MAX_SHADERS,
  MAX_SPRITES,
  MOTION_VERBS,
  type ParamTable,
  PATH_VERBS,
  SCENE_COLOR_SLOTS,
  SHADER_PARAMS,
  SPRITE_PARAMS,
  type Verb,
} from '../../scene/grammar.js'
import matrix from '../bundled/matrix.json'
import sakura from '../bundled/sakura.json'
import voltage from '../bundled/voltage.json'
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
// only these fields matter to the prompt anyway.
function renderExample(
  name: string,
  theme: {
    mode: string
    description: string
    colors: Record<string, string>
    scene?: unknown
  },
): string {
  return [
    `### ${name} — "${theme.description}"`,
    '```json',
    JSON.stringify(
      {
        mode: theme.mode,
        description: theme.description,
        ...(theme.scene !== undefined ? { scene: theme.scene } : {}),
        colors: exampleColors(theme),
      },
      null,
      2,
    ),
    '```',
  ].join('\n')
}

function renderVerbs(verbs: readonly Verb[]): string {
  return verbs.map(v => `- \`${v.name}\` — ${v.reads}`).join('\n')
}

function renderCatalogs(): string {
  const lines: string[] = []
  for (const name of GLYPH_CATALOG_NAMES) {
    const chars = glyphCatalog(name) ?? ''
    const sample = [...chars].slice(0, 12).join('')
    lines.push(`- \`${name}\` — ${sample}`)
  }
  return lines.join('\n')
}

/**
 * Renders a parameter table as prose.
 *
 * The ranges here come from the same table the loader clamps against and the
 * editor schema advertises. The old prompt wrote "intensity (0.15–1)" by hand
 * next to a clamp table that was free to disagree with it.
 */
function renderParams(table: ParamTable, skip: readonly string[] = []): string {
  const lines: string[] = []
  for (const [key, spec] of Object.entries(table)) {
    if (skip.includes(key)) continue
    let range: string
    switch (spec.type) {
      case 'number':
      case 'int':
        range = `${spec.min}–${spec.max}, default ${spec.default}`
        break
      case 'enum':
        range = `${spec.values.join(' | ')}`
        break
      case 'slot':
        range = `a colour slot, default ${spec.default}`
        break
      case 'char':
        range = 'one character, or "" for none'
        break
      case 'text':
        range = `up to ${spec.maxCols} characters`
        break
      case 'expr':
        range = `up to ${spec.maxLength} characters`
        break
      case 'frames':
        range = `up to ${spec.maxFrames} frames, ${spec.maxRows} rows, ${spec.maxCols} columns`
        break
    }
    lines.push(`- \`${key}\` (${range}) — ${spec.describe}`)
  }
  return lines.join('\n')
}

function renderFunctions(): string {
  const byArity = new Map<number, string[]>()
  for (const [name, arity] of FUNCTIONS) {
    const list = byArity.get(arity) ?? []
    list.push(name)
    byArity.set(arity, list)
  }
  return [...byArity.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(
      ([arity, names]) =>
        `- ${arity} argument${arity === 1 ? '' : 's'}: ${names.map(n => `\`${n}\``).join(', ')}`,
    )
    .join('\n')
}

/**
 * The scene half of the prompt.
 *
 * What used to be here was a menu: three primitives, each annotated with the
 * moods it suited. Asking for "cyberpunk" therefore produced matrix's rain in
 * a different colour, every time, because the prompt said cyber meant rain.
 * The menu is gone. What replaces it is a vocabulary and the instruction to
 * design with it.
 */
function renderSceneSection(): string {
  return `## The animation

Design the motion the way you design the palette: from the idea, not from a
menu. A scene is drawn faintly behind the conversation, and its colours are
derived from your palette automatically, so it always matches the theme.

Three kinds of layer, and most good scenes use two or three in combination —
one ambient texture, one accent, sometimes one subject:

- **fields** (up to ${MAX_FIELDS}) — particles. Use for TEXTURE: weather, circuitry,
  static, embers, stars, dust.
- **sprites** (up to ${MAX_SPRITES}) — art you draw yourself, animated along a path. Use
  for a SUBJECT: a creature, an object, a character. If the vibe names a
  thing, draw the thing.
- **shaders** (up to ${MAX_SHADERS}) — a maths expression evaluated per cell. Use for a
  RHYTHM the other two cannot express: interference, waves, plasma, pulses.

It is still data, not code — names and bounded numbers, plus arithmetic in the
shader — which is what makes a theme safe to share.

### Field motions

${renderVerbs(MOTION_VERBS)}

### Fade modes

${renderVerbs(FADE_MODES)}

### Glyph catalogs

${renderCatalogs()}

\`braille\` is the densest but renders blank in fonts without a Braille face;
prefer it only when the idea really calls for it.

### Field parameters

${renderParams(FIELD_PARAMS)}

### Sprite parameters

Frames are rows of characters, every row the same width and every frame the
same size. **A space is transparent**, so the sprite has a silhouette rather
than a rectangle — draw with that in mind. Use plain ASCII, box drawing
(\`─│┌┐└┘├┤┼\`), blocks (\`█▓▒░\`) and arrows; emoji and any wide character are
rejected on load.

${renderParams(SPRITE_PARAMS)}

A spider descending on its silk, which is what \`trailChar\` is for — on a
\`descend\` path the line already travelled IS the thread:

\`\`\`json
{
  "frames": [
    [" /\\\\_/\\\\ ", "( o.o )", " /| |\\\\ "],
    [" /\\\\_/\\\\ ", "( -.- )", " \\\\| |/ "]
  ],
  "framePeriod": 7, "path": "descend", "pathPeriod": 520,
  "x": 0.84, "y": 0, "span": 0.72,
  "trailChar": "|", "trailColor": "subtle",
  "color": "error", "intensity": 0.85
}
\`\`\`

### Sprite paths

${renderVerbs(PATH_VERBS)}

### Shader parameters

${renderParams(SHADER_PARAMS)}

The expression gets \`u\` and \`v\` (0–1 across and down), \`x\` and \`y\` (cells),
\`t\` (ticks, 10 per second), \`w\`, \`h\`, \`i\`, and the constants \`pi\`, \`tau\`, \`e\`.
**Prefer \`u\` and \`v\`** — \`sin(x/6)\` looks different on an 80-column terminal
and a 200-column one, \`sin(u*13)\` does not. Arithmetic is \`+ - * / % ^\`,
comparisons return 0 or 1, and \`cond ? a : b\` works. Functions:

${renderFunctions()}

### Colour slots a layer may use

${SCENE_COLOR_SLOTS.map(s => `\`${s}\``).join(', ')}

### What not to do

- No emoji or wide characters anywhere — they corrupt the terminal grid and
  are rejected on load.
- There are no backgrounds and no bold: layers paint foreground text only. A
  solid neon slab has to be built from block glyphs (\`█▓▒░\`).
- Do not set every parameter. The defaults are tuned; set what the idea needs.
- Keep the total intensity modest. Intensity is per-layer and adds up, and a
  scene that spends more than about 1.6 across its layers is scaled back down
  automatically — better to choose the balance yourself.
- Name the scene with \`label\`: two or three words, like a track title.

Include a scene unless the idea genuinely asks for stillness (paper, minimal,
zen), in which case \`{"kind": "none"}\`.`
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

${renderSceneSection()}

## Worked examples

These are themes that ship with Claude Code. Note how each picks one signature
hue, gives tools a cooler accent, spends one warm hue, and keeps red for
failure — the same discipline applied to completely different moods.

${renderExample('matrix', matrix)}

${renderExample('sakura', sakura)}

${renderExample('voltage', voltage)}

## Output

Return a single JSON object of the same shape: \`mode\`, a one-line
\`description\`, a \`scene\`, and \`colors\`. Specify every slot you can; any
you omit will be filled from the built-in theme for your chosen mode, which
will look out of place if you leave out something central.`
}

/** The user half: what they asked for, and what the theme will be called. */
export function buildThemeUserPrompt(request: GenerationRequest): string {
  return `Design a theme called "${request.name}".

The user asked for: ${request.vibe}

Return only the JSON object.`
}
