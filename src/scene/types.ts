/**
 * Scene primitive parameter types, defaults and clamp ranges.
 *
 * A scene in a theme file is a primitive NAME plus bounded NUMBERS — never
 * code. That is the property that keeps theme files safe to share, and the
 * clamps here are what "bounded" means: schema parsing clamps out-of-range
 * values to these ranges (with a warning) rather than rejecting the theme.
 *
 * The clamp table is exported so the schema parser, the JSON Schema emitted
 * for editor autocomplete, and the models themselves all agree on one set of
 * numbers.
 */

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

export type SceneConfig =
  | { kind: 'none' }
  | { kind: 'rain'; params: RainParams }
  | { kind: 'petals'; params: PetalsParams }

export type SceneKind = SceneConfig['kind']

type ClampSpec<P> = {
  [K in keyof P]: { default: number; min: number; max: number }
}

export const RAIN_CLAMPS: ClampSpec<RainParams> = {
  density: { default: 0.33, min: 0.05, max: 1 },
  speedMin: { default: 0.3, min: 0.05, max: 3 },
  speedMax: { default: 1.2, min: 0.05, max: 3 },
  trailMin: { default: 6, min: 2, max: 40 },
  trailMax: { default: 26, min: 2, max: 40 },
  mutateRate: { default: 0.01, min: 0, max: 0.2 },
  // Default below 1: the scene is a backdrop to read code over, and at full
  // strength the glyphs compete with the conversation text.
  intensity: { default: 0.7, min: 0.15, max: 1 },
}

export const PETALS_CLAMPS: ClampSpec<PetalsParams> = {
  density: { default: 7.5, min: 0.5, max: 25 },
  fallMin: { default: 0.08, min: 0.02, max: 1 },
  fallMax: { default: 0.25, min: 0.02, max: 1 },
  swayAmp: { default: 2.2, min: 0, max: 6 },
  swayPeriod: { default: 90, min: 20, max: 600 },
  tumblePeriod: { default: 40, min: 8, max: 400 },
  intensity: { default: 0.7, min: 0.15, max: 1 },
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
