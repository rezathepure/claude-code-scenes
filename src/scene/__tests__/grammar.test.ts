import { describe, expect, test } from 'bun:test'
import { stringWidth } from '@anthropic/ink'
import { buildThemeJsonSchema } from '../../themes/jsonSchema.js'
import { coerceParams } from '../../themes/schema.js'
import type { ThemeWarning } from '../../themes/schema.js'
import { FRAME_CHAR_RANGES, isDrawableChar, validateFrames } from '../frames.js'
import { allGlyphCatalogs, glyphCatalog } from '../glyphs.js'
import {
  FIELD_PARAMS,
  type FramesSpec,
  SCENE_COLOR_SLOTS,
  SCENE_PARAMS,
  SHADER_PARAMS,
  SPRITE_PARAMS,
} from '../grammar.js'
import { RAIN_CLAMPS } from '../types.js'

const FRAMES_SPEC = SPRITE_PARAMS.frames as FramesSpec

function coerce(raw: unknown, table = FIELD_PARAMS) {
  const warnings: ThemeWarning[] = []
  const out = coerceParams(raw, table, 'scene.fields[0]', 'test-only', warnings)
  return { out, warnings, messages: warnings.map(w => w.message) }
}

describe('glyph catalogs', () => {
  test('every glyph of every catalog is width 1', () => {
    // ScenePass writes every cell as Narrow without checking; one wide glyph
    // desyncs the buffer for the rest of the row.
    for (const [name, chars] of allGlyphCatalogs()) {
      for (const g of chars) {
        expect({ name, g, width: stringWidth(g) }).toEqual({
          name,
          g,
          width: 1,
        })
      }
    }
  })

  test('lookup cannot be tricked by inherited object keys', () => {
    // These names come from a model. On an object literal, both of these
    // would be truthy and the catalog would be a function.
    expect(glyphCatalog('__proto__')).toBeNull()
    expect(glyphCatalog('constructor')).toBeNull()
    expect(glyphCatalog('katakana')).not.toBeNull()
  })
})

describe('the sprite character allow-list', () => {
  test('every code point in every allowed range is width 1', () => {
    // The ranges are not a guess: this test is what narrowed them. Widening
    // FRAME_CHAR_RANGES without re-running this is how wide glyphs get in.
    for (const [lo, hi] of FRAME_CHAR_RANGES) {
      for (let cp = lo; cp <= hi; cp++) {
        const ch = String.fromCodePoint(cp)
        if (stringWidth(ch) !== 1) {
          throw new Error(
            `U+${cp.toString(16).toUpperCase()} is width ${stringWidth(ch)}, but is inside an allowed range`,
          )
        }
      }
    }
  })

  test('rejects emoji, wide glyphs and combining marks', () => {
    expect(isDrawableChar('🕷')).toBe(false)
    expect(isDrawableChar('漢')).toBe(false)
    expect(isDrawableChar('é')).toBe(false) // combining acute
    expect(isDrawableChar('\t')).toBe(false)
    expect(isDrawableChar(' ')).toBe(false) // space is transparent, not drawn
    expect(isDrawableChar('|')).toBe(true)
    expect(isDrawableChar('▓')).toBe(true)
  })
})

describe('sprite frame validation', () => {
  const ok = [['-|-|-|', '(o..o)', '/|  |\\']]

  test('accepts uniform ascii art', () => {
    const r = validateFrames(ok, FRAMES_SPEC)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.width).toBe(6)
      expect(r.value.height).toBe(3)
    }
  })

  test('rejects rows of differing width', () => {
    const r = validateFrames([['abc', 'ab']], FRAMES_SPEC)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('pad rows with spaces')
  })

  test('rejects frames of differing height', () => {
    const r = validateFrames([['ab', 'cd'], ['ab']], FRAMES_SPEC)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('every frame must be the same size')
  })

  test('rejects a spider drawn with an actual spider emoji', () => {
    const r = validateFrames([['🕷']], FRAMES_SPEC)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('not a drawable character')
  })

  test('rejects art larger than the limits', () => {
    const wide = [['x'.repeat(FRAMES_SPEC.maxCols + 1)]]
    expect(validateFrames(wide, FRAMES_SPEC).ok).toBe(false)
    const tall = [Array(FRAMES_SPEC.maxRows + 1).fill('x')]
    expect(validateFrames(tall, FRAMES_SPEC).ok).toBe(false)
  })

  test('rejects shapes that are not arrays of strings', () => {
    expect(validateFrames('spider', FRAMES_SPEC).ok).toBe(false)
    expect(validateFrames([], FRAMES_SPEC).ok).toBe(false)
    expect(validateFrames([[1, 2]], FRAMES_SPEC).ok).toBe(false)
  })
})

describe('coerceParams', () => {
  test('fills every parameter from defaults when given nothing', () => {
    const { out, warnings } = coerce({})
    expect(warnings).toHaveLength(0)
    expect(Object.keys(out ?? {}).sort()).toEqual(
      Object.keys(FIELD_PARAMS).sort(),
    )
  })

  test('falls back and warns on an unavailable enum value', () => {
    const { out, messages } = coerce({ motion: 'teleport' })
    expect(out?.motion).toBe('fall')
    expect(messages[0]).toContain('not one of the available values')
  })

  test('falls back and warns on a colour slot a scene cannot use', () => {
    const { out, messages } = coerce({ color: 'diffAddedWord' })
    expect(out?.color).toBe('claude')
    expect(messages[0]).toContain('colour slot')
  })

  test('rounds int params rather than carrying a fraction', () => {
    const { out } = coerce({ priority: 3.7 })
    expect(out?.priority).toBe(4)
  })

  test('strips unprintable characters from display text', () => {
    const out = coerceParams(
      { label: 'neon\u0007 drizzle' },
      SCENE_PARAMS,
      'scene',
      'test-only',
      [],
    )
    expect(out?.label).toBe('neon drizzle')
  })

  test('shortens an over-long label with a warning', () => {
    const warnings: ThemeWarning[] = []
    const out = coerceParams(
      { label: 'a spectacularly long animation name' },
      SCENE_PARAMS,
      'scene',
      'test-only',
      warnings,
    )
    expect((out?.label as string).length).toBe(16)
    expect(warnings[0]?.message).toContain('shortened')
  })

  test('drops the whole layer when a shader has no expression', () => {
    const warnings: ThemeWarning[] = []
    const out = coerceParams(
      { glyphs: 'blocks' },
      SHADER_PARAMS,
      'scene.shaders[0]',
      'test-only',
      warnings,
    )
    expect(out).toBeNull()
    expect(warnings[0]?.message).toContain('Dropping the layer')
  })

  test('drops the whole sprite when its art is malformed', () => {
    const warnings: ThemeWarning[] = []
    const out = coerceParams(
      { frames: [['ab', 'c']] },
      SPRITE_PARAMS,
      'scene.sprites[0]',
      'test-only',
      warnings,
    )
    expect(out).toBeNull()
    expect(warnings[0]?.message).toContain('Dropping the sprite')
  })

  test('ignores an inherited key rather than treating it as a param', () => {
    const { out, messages } = coerce(
      JSON.parse('{"__proto__": {"motion": "scan"}}'),
    )
    expect(out?.motion).toBe('fall')
    expect(messages.join(' ')).not.toContain('scan')
  })
})

describe('one table, every consumer', () => {
  test('the editor schema reports the ranges the loader enforces', () => {
    // The prompt used to hardcode "0.15–1" as prose while the clamp table
    // said something else. Everything reads the table now; this proves it
    // for the schema, and prompt.test.ts proves it for the prompt.
    const schema = buildThemeJsonSchema() as Record<string, any>
    const rain = schema.properties.scene.oneOf.find(
      (arm: any) => arm.properties.kind.enum[0] === 'rain',
    )
    const intensity = rain.properties.params.properties.intensity
    expect(intensity.minimum).toBe(RAIN_CLAMPS.intensity.min)
    expect(intensity.maximum).toBe(RAIN_CLAMPS.intensity.max)
    expect(intensity.default).toBe(RAIN_CLAMPS.intensity.default)
    expect(intensity.description).toBe(RAIN_CLAMPS.intensity.describe)
  })

  test('every scene colour slot is a real slot of the shipped palette', () => {
    const known = new Set(Object.keys(getDarkTheme()))
    for (const slot of SCENE_COLOR_SLOTS) {
      expect({ slot, known: known.has(slot) }).toEqual({ slot, known: true })
    }
  })
})

function getDarkTheme(): Record<string, string> {
  // Imported lazily so this file does not pull the theme registry in at the
  // top level alongside the pure-data tables it mostly tests.
  const { getTheme } = require('../../utils/theme.js')
  return getTheme('dark') as Record<string, string>
}
