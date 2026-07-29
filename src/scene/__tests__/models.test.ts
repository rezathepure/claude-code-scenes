import { describe, expect, test } from 'bun:test'
import { stringWidth } from '@anthropic/ink'
import { derivePetalStyles, deriveRainStyles } from '../colors.js'
import { createFieldModel } from '../field.js'
import { petalsPreset, rainPreset } from '../presets.js'
import { mulberry32 } from '../rng.js'
import {
  defaultPetalsParams,
  defaultRainParams,
  PETAL_GLYPHS,
  RAIN_GLYPHS,
} from '../types.js'

const RAIN_STYLES = { head: 2, ramp: [4, 6, 8, 10, 12, 14] }
const PETAL_STYLES = { head: 2, ramp: [2, 4, 6, 8] }

describe('glyph alphabets', () => {
  test('every rain glyph is width 1', () => {
    // A wide glyph would desync the cell buffer — the scene paints Narrow.
    for (const g of RAIN_GLYPHS) {
      expect(stringWidth(g)).toBe(1)
    }
  })

  test('every petal glyph is width 1', () => {
    for (const g of PETAL_GLYPHS) {
      expect(stringWidth(g)).toBe(1)
    }
  })
})

describe('rain model', () => {
  test('is deterministic under a seeded rng', () => {
    const a = createFieldModel(
      rainPreset(defaultRainParams()),
      RAIN_STYLES,
      mulberry32(7),
    )
    const b = createFieldModel(
      rainPreset(defaultRainParams()),
      RAIN_STYLES,
      mulberry32(7),
    )
    a.resize(80, 24)
    b.resize(80, 24)
    for (let i = 0; i < 50; i++) {
      a.tick()
      b.tick()
    }
    expect(a.cells()).toEqual(b.cells())
  })

  test('cells are stable between ticks', () => {
    // React renders between ticker ticks must repaint the identical frame.
    const m = createFieldModel(
      rainPreset(defaultRainParams()),
      RAIN_STYLES,
      mulberry32(1),
    )
    m.resize(80, 24)
    m.tick()
    expect(m.cells()).toBe(m.cells()) // same array identity, not just equal
  })

  test('all cells stay in bounds across 1000 ticks', () => {
    const m = createFieldModel(
      rainPreset(defaultRainParams()),
      RAIN_STYLES,
      mulberry32(3),
    )
    m.resize(60, 20)
    for (let i = 0; i < 1000; i++) {
      m.tick()
      for (const cell of m.cells()) {
        expect(cell.x).toBeGreaterThanOrEqual(0)
        expect(cell.x).toBeLessThan(60)
        expect(cell.y).toBeGreaterThanOrEqual(0)
        expect(cell.y).toBeLessThan(20)
      }
    }
  })

  test('keeps raining forever (drops respawn)', () => {
    const m = createFieldModel(
      rainPreset(defaultRainParams()),
      RAIN_STYLES,
      mulberry32(5),
    )
    m.resize(40, 12)
    for (let i = 0; i < 500; i++) m.tick()
    expect(m.cells().length).toBeGreaterThan(0)
  })

  test('density scales the number of drops', () => {
    const sparse = createFieldModel(
      rainPreset({ ...defaultRainParams(), density: 0.05 }),
      RAIN_STYLES,
      mulberry32(9),
    )
    const dense = createFieldModel(
      rainPreset({ ...defaultRainParams(), density: 1 }),
      RAIN_STYLES,
      mulberry32(9),
    )
    sparse.resize(100, 30)
    dense.resize(100, 30)
    expect(dense.cells().length).toBeGreaterThan(sparse.cells().length * 3)
  })

  test('heads use the head style, trails use the ramp', () => {
    const m = createFieldModel(
      rainPreset(defaultRainParams()),
      RAIN_STYLES,
      mulberry32(2),
    )
    m.resize(80, 24)
    const styles = new Set(m.cells().map(c => c.styleId))
    expect(styles.has(RAIN_STYLES.head)).toBe(true)
    expect([...styles].some(s => RAIN_STYLES.ramp.includes(s))).toBe(true)
  })

  test('resize resets to the new dimensions', () => {
    const m = createFieldModel(
      rainPreset(defaultRainParams()),
      RAIN_STYLES,
      mulberry32(4),
    )
    m.resize(200, 50)
    m.tick()
    m.resize(20, 5)
    for (const cell of m.cells()) {
      expect(cell.x).toBeLessThan(20)
      expect(cell.y).toBeLessThan(5)
    }
  })
})

describe('petals model', () => {
  test('is deterministic under a seeded rng', () => {
    const a = createFieldModel(
      petalsPreset(defaultPetalsParams()),
      PETAL_STYLES,
      mulberry32(7),
    )
    const b = createFieldModel(
      petalsPreset(defaultPetalsParams()),
      PETAL_STYLES,
      mulberry32(7),
    )
    a.resize(80, 24)
    b.resize(80, 24)
    for (let i = 0; i < 50; i++) {
      a.tick()
      b.tick()
    }
    expect(a.cells()).toEqual(b.cells())
  })

  test('all cells stay in bounds across 1000 ticks', () => {
    const m = createFieldModel(
      petalsPreset(defaultPetalsParams()),
      PETAL_STYLES,
      mulberry32(3),
    )
    m.resize(60, 20)
    for (let i = 0; i < 1000; i++) {
      m.tick()
      for (const cell of m.cells()) {
        expect(cell.x).toBeGreaterThanOrEqual(0)
        expect(cell.x).toBeLessThan(60)
        expect(cell.y).toBeGreaterThanOrEqual(0)
        expect(cell.y).toBeLessThan(20)
      }
    }
  })

  test('petals tumble through the glyph cycle over time', () => {
    const m = createFieldModel(
      petalsPreset(defaultPetalsParams()),
      PETAL_STYLES,
      mulberry32(11),
    )
    m.resize(80, 24)
    const seen = new Set<string>()
    for (let i = 0; i < 300; i++) {
      m.tick()
      for (const cell of m.cells()) seen.add(cell.char)
    }
    // Over 300 ticks every tumble phase should have shown up somewhere.
    for (const g of PETAL_GLYPHS) {
      expect(seen.has(g)).toBe(true)
    }
  })

  test('keeps drifting forever (petals respawn)', () => {
    const m = createFieldModel(
      petalsPreset(defaultPetalsParams()),
      PETAL_STYLES,
      mulberry32(5),
    )
    m.resize(40, 12)
    for (let i = 0; i < 500; i++) m.tick()
    expect(m.cells().length).toBeGreaterThan(0)
  })
})

describe('colour derivation', () => {
  /** Fake interner: records colours, hands out sequential even ids. */
  function fakeInk(): {
    colors: string[]
    internSceneStyle: (c: string) => number
  } {
    const colors: string[] = []
    return {
      colors,
      internSceneStyle(color: string): number {
        colors.push(color)
        return colors.length * 2
      },
    }
  }

  test('rain ramp comes from the theme accent hue, brightest first', () => {
    const ink = fakeInk()
    const { head, ramp } = deriveRainStyles({ claude: 'rgb(0,255,65)' }, ink)

    expect(ramp).toHaveLength(6)
    expect(head).toBeGreaterThan(0)
    // Every derived colour parses as rgb() and is green-dominant, matching
    // the accent's hue.
    for (const c of ink.colors) {
      const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(c)
      expect(m).not.toBeNull()
      const [, r, g] = m!
      expect(Number(g)).toBeGreaterThan(Number(r))
    }
  })

  test('a crimson theme gets crimson rain — hue follows the palette', () => {
    const ink = fakeInk()
    deriveRainStyles({ claude: 'rgb(180,42,58)' }, ink)
    for (const c of ink.colors) {
      const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(c)!
      expect(Number(m[1])).toBeGreaterThan(Number(m[3])) // red > blue
    }
  })

  test('petal tints blend claude and claudeShimmer', () => {
    const ink = fakeInk()
    const { tints } = derivePetalStyles(
      { claude: 'rgb(255,138,190)', claudeShimmer: 'rgb(255,200,225)' },
      ink,
    )
    expect(tints).toHaveLength(4)
    expect(new Set(ink.colors).size).toBe(4) // four distinct tints
  })

  test('survives an unparseable palette without throwing', () => {
    const ink = fakeInk()
    expect(() =>
      deriveRainStyles({ claude: 'not-a-colour' }, ink),
    ).not.toThrow()
    expect(() => derivePetalStyles({}, ink)).not.toThrow()
  })
})
