/**
 * Scene types, defaults and clamp ranges.
 *
 * A scene in a theme file is NAMES and BOUNDED NUMBERS — motions, catalogs,
 * colour slots, drawn characters from a fixed allow-list, and in a shader one
 * arithmetic expression run by a parser that has no property access and never
 * touches the Function constructor. Nothing in a theme file is executed as
 * code, which is the property that keeps themes safe to share.
 *
 * The clamps here are what "bounded" means: schema parsing clamps out-of-range
 * values to these ranges (with a warning) rather than rejecting the theme.
 *
 * The clamp table is exported so the schema parser, the JSON Schema emitted
 * for editor autocomplete, and the models themselves all agree on one set of
 * numbers.
 */

import type { ValidatedFrames } from './frames.js'
import type { NumericTable } from './grammar.js'

export type RainParams = {
  /** Drops per column of terminal width. */
  density: number
  /** Fall speed range, cells per tick (10 ticks/second). */
  speedMin: number
  speedMax: number
  /** Trail length range, cells. */
  trailMin: number
  trailMax: number
  /** Probability per glyph per tick of mutating to a different character. */
  mutateRate: number
  /** Overall opacity, 1 = full strength; lower fades toward the background. */
  intensity: number
}

export type PetalsParams = {
  /** Petals per 1000 screen cells. */
  density: number
  /** Fall speed range, cells per tick. */
  fallMin: number
  fallMax: number
  /** Horizontal sway amplitude, cells. */
  swayAmp: number
  /** Ticks per full sway cycle. */
  swayPeriod: number
  /** Ticks per full tumble cycle (4 glyph phases). */
  tumblePeriod: number
  /** Overall opacity, 1 = full strength; lower fades toward the background. */
  intensity: number
}

/**
 * One layer of a composed scene. Every field comes from FIELD_PARAMS, so the
 * grammar table and this type are two views of one thing.
 */
export type FieldLayer = {
  motion: string
  glyphs: string
  color: string
  fade: string
  intensity: number
  density: number
  priority: number
  weight: number
  speedMin: number
  speedMax: number
  trailMin: number
  trailMax: number
  angle: number
  swayAmp: number
  swayPeriod: number
  tumblePeriod: number
  mutateRate: number
}

/** Drawn art with a motion path. See SPRITE_PARAMS. */
export type SpriteLayer = {
  frames: ValidatedFrames
  framePeriod: number
  path: string
  pathPeriod: number
  x: number
  y: number
  span: number
  count: number
  trailChar: string
  trailColor: string
  color: string
  intensity: number
  priority: number
}

/** An expression evaluated per cell. See SHADER_PARAMS. */
export type ShaderLayer = {
  expr: string
  glyphs: string
  color: string
  threshold: number
  levels: number
  step: number
  intensity: number
  weight: number
  priority: number
}

/**
 * A composed scene: any mix of ambient fields, drawn sprites and expression
 * shaders. This is what makes an animation bespoke rather than chosen — the
 * model designs the motion instead of naming one of two primitives.
 */
export type CustomScene = {
  /** Short name for the animation, shown beside the theme in the picker. */
  label: string
  fields: FieldLayer[]
  sprites: SpriteLayer[]
  shaders: ShaderLayer[]
}

export type SceneConfig =
  | { kind: 'none' }
  | { kind: 'rain'; params: RainParams }
  | { kind: 'petals'; params: PetalsParams }
  | { kind: 'custom'; scene: CustomScene }

export type SceneKind = SceneConfig['kind']

/**
 * The two preset tables. Their numbers are frozen — `loader.test.ts` pins the
 * clamp behaviour and `golden.test.ts` pins the frames these defaults produce
 * — but they now carry their own prose, so the editor schema no longer keeps
 * a second copy of the descriptions.
 */
export const RAIN_CLAMPS: NumericTable<RainParams> = {
  density: {
    type: 'number',
    default: 0.33,
    min: 0.05,
    max: 1,
    describe: 'Drops per column of terminal width.',
  },
  speedMin: {
    type: 'number',
    default: 0.3,
    min: 0.05,
    max: 3,
    describe: 'Slowest fall speed, cells per tick (10 ticks/second).',
  },
  speedMax: {
    type: 'number',
    default: 1.2,
    min: 0.05,
    max: 3,
    describe: 'Fastest fall speed, cells per tick.',
  },
  trailMin: {
    type: 'number',
    default: 6,
    min: 2,
    max: 40,
    describe: 'Shortest trail, cells.',
  },
  trailMax: {
    type: 'number',
    default: 26,
    min: 2,
    max: 40,
    describe: 'Longest trail, cells.',
  },
  mutateRate: {
    type: 'number',
    default: 0.01,
    min: 0,
    max: 0.2,
    describe: 'Per-glyph chance per tick of mutating.',
  },
  // Default below 1: the scene is a backdrop to read code over, and at full
  // strength the glyphs compete with the conversation text.
  intensity: {
    type: 'number',
    default: 0.7,
    min: 0.15,
    max: 1,
    describe:
      'Overall opacity: 1 is full strength, lower fades the rain toward the background.',
  },
}

export const PETALS_CLAMPS: NumericTable<PetalsParams> = {
  density: {
    type: 'number',
    default: 7.5,
    min: 0.5,
    max: 25,
    describe: 'Petals per 1000 screen cells.',
  },
  fallMin: {
    type: 'number',
    default: 0.08,
    min: 0.02,
    max: 1,
    describe: 'Slowest fall speed, cells per tick.',
  },
  fallMax: {
    type: 'number',
    default: 0.25,
    min: 0.02,
    max: 1,
    describe: 'Fastest fall speed, cells per tick.',
  },
  swayAmp: {
    type: 'number',
    default: 2.2,
    min: 0,
    max: 6,
    describe: 'Horizontal sway amplitude, cells.',
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
    default: 40,
    min: 8,
    max: 400,
    describe: 'Ticks per full tumble cycle.',
  },
  intensity: {
    type: 'number',
    default: 0.7,
    min: 0.15,
    max: 1,
    describe:
      'Overall opacity: 1 is full strength, lower fades the petals toward the background.',
  },
}

export function defaultRainParams(): RainParams {
  return {
    density: RAIN_CLAMPS.density.default,
    speedMin: RAIN_CLAMPS.speedMin.default,
    speedMax: RAIN_CLAMPS.speedMax.default,
    trailMin: RAIN_CLAMPS.trailMin.default,
    trailMax: RAIN_CLAMPS.trailMax.default,
    mutateRate: RAIN_CLAMPS.mutateRate.default,
    intensity: RAIN_CLAMPS.intensity.default,
  }
}

export function defaultPetalsParams(): PetalsParams {
  return {
    density: PETALS_CLAMPS.density.default,
    fallMin: PETALS_CLAMPS.fallMin.default,
    fallMax: PETALS_CLAMPS.fallMax.default,
    swayAmp: PETALS_CLAMPS.swayAmp.default,
    swayPeriod: PETALS_CLAMPS.swayPeriod.default,
    tumblePeriod: PETALS_CLAMPS.tumblePeriod.default,
    intensity: PETALS_CLAMPS.intensity.default,
  }
}

/**
 * Glyph alphabets are fixed constants, never parameters — an arbitrary glyph
 * would let a theme file paint arbitrary characters, and every entry here is
 * verified width-1 by tests (a wide glyph would desync the cell buffer).
 */
export const RAIN_GLYPHS =
  'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789'
export const PETAL_GLYPHS = ['❀', '✿', '⁕', '·'] as const
