/**
 * The vocabulary a theme file uses to describe an animation.
 *
 * Everything a scene can say is one of these parameters, and every parameter
 * is declared exactly once, here. Four consumers read these tables — the
 * loader (which enforces them), the editor JSON Schema, the tool schema sent
 * to the model, and the generation prompt — so a range can never mean one
 * thing in the prompt and another on load. That drift was real: the prompt
 * hardcoded "intensity 0.15–1" as prose while RAIN_CLAMPS was the actual
 * authority.
 *
 * The tables stay FLAT — scalars only, no nested objects — because a flat
 * table is what all four consumers can render mechanically. The one exception
 * is `frames`, which is a sprite's drawn art and gets its own spec type.
 *
 * This is still data, not code. The one parameter that carries an expression
 * (`shader.expr`) is evaluated by a hand-written parser with no property
 * access and no `Function` constructor — see expr/.
 */

import { GLYPH_CATALOG_NAMES } from './glyphs.js'

// --- Parameter specs -------------------------------------------------------

export type NumberSpec = {
  type: 'number'
  default: number
  min: number
  max: number
  describe: string
}
export type IntSpec = {
  type: 'int'
  default: number
  min: number
  max: number
  describe: string
}
export type EnumSpec = {
  type: 'enum'
  default: string
  values: readonly string[]
  describe: string
}
/** A theme colour slot name; the scene's colours are derived from it. */
export type SlotSpec = { type: 'slot'; default: string; describe: string }
/** A maths expression, compiled once at scene-build time. */
export type ExprSpec = {
  type: 'expr'
  default: string
  maxLength: number
  describe: string
}
/** A single width-1 character, or empty for "none". */
export type CharSpec = { type: 'char'; default: string; describe: string }
/** Short display text, measured in terminal columns. */
export type TextSpec = {
  type: 'text'
  default: string
  maxCols: number
  describe: string
}
/** Drawn sprite art: frames of rows of characters. */
export type FramesSpec = {
  type: 'frames'
  maxFrames: number
  maxRows: number
  maxCols: number
  maxCells: number
  describe: string
}

export type ParamSpec =
  | NumberSpec
  | IntSpec
  | EnumSpec
  | SlotSpec
  | ExprSpec
  | CharSpec
  | TextSpec
  | FramesSpec

export type ParamTable = Readonly<Record<string, ParamSpec>>

/**
 * A table that is guaranteed to cover every key of a params type — what the
 * old `ClampSpec<P>` bought us, kept. Losing it would let a param exist with
 * no default, and `coerceParams` would then emit an incomplete record while
 * the type system claimed otherwise.
 */
export type NumericTable<P> = { readonly [K in keyof P]: NumberSpec | IntSpec }

// --- Vocabularies ----------------------------------------------------------

/** A motion verb plus the prose that teaches the model when to reach for it. */
export type Verb = { name: string; reads: string }

/**
 * How a field layer's particles move. Seven verbs rather than two primitives:
 * `fall` IS the old rain and `drift` IS the old petals, which is the point —
 * the presets are expressible in the grammar, so nothing is a special case.
 */
export const MOTION_VERBS: readonly Verb[] = [
  {
    name: 'fall',
    reads:
      'columnar streams with fading trails — hard rain, falling code, a downpour',
  },
  {
    name: 'rise',
    reads: 'drifts upward and fades — embers, bubbles, sparks off a fire',
  },
  {
    name: 'drift',
    reads:
      'slow fall with a sideways sway and tumbling glyphs — petals, leaves, ash',
  },
  {
    name: 'stream',
    reads:
      'travels in a straight line at any angle — slanted snow, wind, meteors',
  },
  {
    name: 'scan',
    reads:
      'wide bands sweeping across the screen — scanlines, sonar, a radar wipe',
  },
  {
    name: 'orbit',
    reads: 'ellipses about a centre — fireflies, electrons, dust in a sunbeam',
  },
  {
    name: 'twinkle',
    reads:
      'stationary, fading in and out on its own clock — stars, circuitry, city lights',
  },
]

/** How a sprite travels. Every path is a pure function of the tick count. */
export const PATH_VERBS: readonly Verb[] = [
  {
    name: 'descend',
    reads: 'lowers from the top edge and climbs back — a spider on silk',
  },
  { name: 'ascend', reads: 'rises from the bottom and sinks back — a balloon' },
  { name: 'patrol', reads: 'crosses left to right and back — a bird, a fish' },
  { name: 'crawl', reads: 'crosses hugging the bottom edge — an insect' },
  { name: 'orbit', reads: 'travels an ellipse about a centre point' },
  { name: 'hover', reads: 'bobs gently in place' },
  { name: 'static', reads: 'never moves' },
]

/** How a layer picks a style from its derived ramp. */
export const FADE_MODES: readonly Verb[] = [
  { name: 'trail', reads: 'brightest at the head, fading down the trail' },
  { name: 'flat', reads: 'one tint per particle, chosen when it spawns' },
  { name: 'twinkle', reads: 'brightness cycles on the particle’s own clock' },
]

/**
 * Colour slots a scene may derive from. Curated rather than "any slot": these
 * are the ones whose meaning survives being turned into a six-step ramp, and
 * a short list is a list the model picks from thoughtfully.
 */
export const SCENE_COLOR_SLOTS: readonly string[] = [
  'claude',
  'claudeShimmer',
  'permission',
  'planMode',
  'suggestion',
  'remember',
  'autoAccept',
  'bashBorder',
  'ide',
  'success',
  'error',
  'warning',
  'text',
  'inactive',
  'subtle',
]

const verbNames = (verbs: readonly Verb[]): readonly string[] =>
  verbs.map(v => v.name)

// --- Limits ----------------------------------------------------------------

/** Layer counts. Small on purpose: three good layers beat eight muddy ones. */
export const MAX_FIELDS = 4
export const MAX_SPRITES = 3
export const MAX_SHADERS = 2

// --- Tables ----------------------------------------------------------------

export const SCENE_PARAMS: ParamTable = {
  label: {
    type: 'text',
    default: '',
    maxCols: 16,
    describe:
      'Two or three words naming the animation, shown beside the theme in the picker — "neon drizzle", "web-swing". Printable ASCII.',
  },
}

export const FIELD_PARAMS: ParamTable = {
  motion: {
    type: 'enum',
    default: 'fall',
    values: verbNames(MOTION_VERBS),
    describe: 'How the particles move.',
  },
  glyphs: {
    type: 'enum',
    default: 'ascii',
    values: GLYPH_CATALOG_NAMES,
    describe: 'Which alphabet the particles are drawn from.',
  },
  color: {
    type: 'slot',
    default: 'claude',
    describe:
      'Theme colour slot this layer derives its ramp from. The animation always matches the palette.',
  },
  fade: {
    type: 'enum',
    default: 'trail',
    values: verbNames(FADE_MODES),
    describe: 'How brightness is distributed across a particle.',
  },
  intensity: {
    type: 'number',
    default: 0.55,
    min: 0.15,
    max: 1,
    describe:
      'Opacity of this layer. 1 competes with the conversation text; 0.4–0.6 reads as a backdrop.',
  },
  density: {
    type: 'number',
    default: 0.33,
    min: 0.02,
    max: 3,
    describe:
      'How much of it there is, relative to screen width. Above ~1 the screen starts to fill.',
  },
  priority: {
    type: 'int',
    default: 5,
    min: 0,
    max: 9,
    describe:
      'Paint order. Lower paints first and therefore wins the cell; use it to keep an accent in front of a texture.',
  },
  weight: {
    type: 'int',
    default: 3,
    min: 1,
    max: 10,
    describe:
      'This layer’s share of the frame’s cell budget, relative to the other layers.',
  },
  speedMin: {
    type: 'number',
    default: 0.3,
    min: 0.02,
    max: 3,
    describe: 'Slowest travel, cells per tick (10 ticks per second).',
  },
  speedMax: {
    type: 'number',
    default: 1.2,
    min: 0.02,
    max: 3,
    describe: 'Fastest travel, cells per tick.',
  },
  trailMin: {
    type: 'int',
    default: 6,
    min: 1,
    max: 40,
    describe: 'Shortest trail, cells. 1 means no trail at all.',
  },
  trailMax: {
    type: 'int',
    default: 26,
    min: 1,
    max: 40,
    describe: 'Longest trail, cells.',
  },
  angle: {
    type: 'number',
    default: 0,
    min: -180,
    max: 180,
    describe:
      'Travel direction in degrees for `stream`, 0 being straight down. Ignored by the other verbs.',
  },
  swayAmp: {
    type: 'number',
    default: 0,
    min: 0,
    max: 6,
    describe: 'Sideways sway, cells. 0 falls straight.',
  },
  swayPeriod: {
    type: 'number',
    default: 90,
    min: 20,
    max: 600,
    describe: 'Ticks per full sway cycle.',
  },
  tumblePeriod: {
    type: 'number',
    default: 0,
    min: 0,
    max: 400,
    describe:
      'Ticks per full cycle through the glyph alphabet, giving a tumbling look. 0 keeps each particle’s glyph fixed.',
  },
  mutateRate: {
    type: 'number',
    default: 0.01,
    min: 0,
    max: 0.2,
    describe:
      'Chance per glyph per tick of flickering to a different character.',
  },
}

export const SPRITE_PARAMS: ParamTable = {
  frames: {
    type: 'frames',
    maxFrames: 6,
    maxRows: 8,
    maxCols: 24,
    maxCells: 1152,
    describe:
      'The drawn art: an array of frames, each an array of equal-width rows. A space is transparent, so the sprite has a silhouette rather than a rectangle.',
  },
  framePeriod: {
    type: 'int',
    default: 6,
    min: 1,
    max: 60,
    describe: 'Ticks each frame is held. 10 ticks is one second.',
  },
  path: {
    type: 'enum',
    default: 'static',
    values: verbNames(PATH_VERBS),
    describe: 'How the sprite travels.',
  },
  pathPeriod: {
    type: 'int',
    default: 420,
    min: 20,
    max: 4000,
    describe: 'Ticks for one full traversal. Longer is calmer.',
  },
  x: {
    type: 'number',
    default: 0.5,
    min: 0,
    max: 1,
    describe:
      'Where the path starts across the screen, 0 being the left edge. Keep sprites near an edge so they do not sit under the conversation.',
  },
  y: {
    type: 'number',
    default: 0,
    min: 0,
    max: 1,
    describe: 'Where the path starts down the screen, 0 being the top.',
  },
  span: {
    type: 'number',
    default: 0.7,
    min: 0,
    max: 1,
    describe: 'How far it travels, as a fraction of the screen.',
  },
  count: {
    type: 'int',
    default: 1,
    min: 1,
    max: 4,
    describe: 'Copies of the sprite, spread out along the path.',
  },
  trailChar: {
    type: 'char',
    default: '',
    describe:
      'A single character drawn along the path already travelled — for `descend` that line is the silk a spider hangs from. Empty for none.',
  },
  trailColor: {
    type: 'slot',
    default: 'subtle',
    describe: 'Theme colour slot for the trail.',
  },
  color: {
    type: 'slot',
    default: 'claude',
    describe: 'Theme colour slot for the sprite body.',
  },
  intensity: {
    type: 'number',
    default: 0.85,
    min: 0.15,
    max: 1,
    describe:
      'Opacity of the sprite. Sprites read as the subject, so they carry more than a field layer.',
  },
  priority: {
    type: 'int',
    default: 0,
    min: 0,
    max: 9,
    describe: 'Paint order; sprites default to the front.',
  },
}

export const SHADER_PARAMS: ParamTable = {
  expr: {
    type: 'expr',
    default: '',
    maxLength: 120,
    describe:
      'A maths expression evaluated per cell, giving a brightness. Use `u` and `v` (0–1 across and down) rather than `x` and `y` so the look does not change with terminal size, and `t` for the tick.',
  },
  glyphs: {
    type: 'enum',
    default: 'blocks',
    values: GLYPH_CATALOG_NAMES,
    describe: 'Alphabet the brightness is drawn with, dimmest character first.',
  },
  color: {
    type: 'slot',
    default: 'claude',
    describe: 'Theme colour slot this layer derives its ramp from.',
  },
  threshold: {
    type: 'number',
    default: 0.7,
    min: 0,
    max: 0.98,
    describe:
      'Brightness below which nothing is drawn. Raise it to leave more of the screen clear.',
  },
  levels: {
    type: 'int',
    default: 4,
    min: 2,
    max: 7,
    describe: 'How many brightness steps the ramp is quantised to.',
  },
  step: {
    type: 'int',
    default: 1,
    min: 1,
    max: 4,
    describe: 'Sample every Nth cell. Higher is coarser and cheaper.',
  },
  intensity: {
    type: 'number',
    default: 0.35,
    min: 0.15,
    max: 1,
    describe: 'Opacity of the layer.',
  },
  weight: {
    type: 'int',
    default: 2,
    min: 1,
    max: 10,
    describe: 'Share of the frame’s cell budget, relative to other layers.',
  },
  priority: {
    type: 'int',
    default: 8,
    min: 0,
    max: 9,
    describe: 'Paint order; shaders default to the back.',
  },
}
