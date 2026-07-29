import { describe, expect, test } from 'bun:test'
import { loadThemeFromText } from '../../themes/loader.js'
import { serializeThemeFile } from '../../themes/save.js'
import { SPRITE_PARAMS } from '../grammar.js'
import type { FramesSpec } from '../grammar.js'
import { validateFrames } from '../frames.js'
import { PATH_VERBS } from '../grammar.js'
import { pathAt } from '../paths.js'
import { mulberry32 } from '../rng.js'
import { createSpriteModel } from '../sprite.js'
import type { SpriteLayer } from '../types.js'

const STYLES = { body: 2, trail: 4 }

/** A three-row spider, the shape the whole feature exists to make possible. */
const SPIDER = [
  [' /\\_/\\ ', '( o.o )', ' /| |\\ '],
  [' /\\_/\\ ', '( -.- )', ' \\| |/ '],
]

function frames(art: string[][] = SPIDER) {
  const r = validateFrames(art, SPRITE_PARAMS.frames as FramesSpec)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

function sprite(over: Partial<SpriteLayer> = {}): SpriteLayer {
  return {
    frames: frames(),
    framePeriod: 6,
    path: 'descend',
    pathPeriod: 420,
    x: 0.84,
    y: 0,
    span: 0.72,
    count: 1,
    trailChar: '|',
    trailColor: 'subtle',
    color: 'error',
    intensity: 0.85,
    priority: 0,
    ...over,
  }
}

describe('the sprite player', () => {
  test('draws the art, and treats a space as transparent', () => {
    const m = createSpriteModel(
      sprite({ path: 'static' }),
      STYLES,
      mulberry32(1),
    )
    m.resize(40, 12)
    const body = m.cells().filter(c => c.styleId === STYLES.body)
    // 7x3 = 21 cells of art, but the spaces in the drawing are not painted —
    // that is what gives the sprite a silhouette instead of a box.
    expect(body.length).toBeGreaterThan(0)
    expect(body.length).toBeLessThan(21)
    expect(body.some(c => c.char === ' ')).toBe(false)
  })

  test('advances exactly on framePeriod', () => {
    const m = createSpriteModel(
      sprite({ path: 'static', framePeriod: 5 }),
      STYLES,
      mulberry32(1),
    )
    m.resize(40, 12)
    const render = () =>
      m
        .cells()
        .filter(c => c.styleId === STYLES.body)
        .map(c => c.char)
        .join('')
    const first = render()
    for (let i = 0; i < 4; i++) m.tick()
    expect(render()).toBe(first) // still frame 0
    m.tick()
    expect(render()).not.toBe(first) // frame 1
  })

  test('hangs its silk from the anchor down to the spider', () => {
    const m = createSpriteModel(sprite(), STYLES, mulberry32(1))
    m.resize(40, 16)
    for (let i = 0; i < 120; i++) m.tick()
    const silk = m.cells().filter(c => c.styleId === STYLES.trail)
    expect(silk.length).toBeGreaterThan(0)
    expect(silk.every(c => c.char === '|')).toBe(true)
    // A single column, directly above the body.
    expect(new Set(silk.map(c => c.x)).size).toBe(1)
  })

  test('draws no trail when the theme asks for none', () => {
    const m = createSpriteModel(
      sprite({ trailChar: '' }),
      STYLES,
      mulberry32(1),
    )
    m.resize(40, 16)
    for (let i = 0; i < 120; i++) m.tick()
    expect(m.cells().every(c => c.styleId === STYLES.body)).toBe(true)
  })

  for (const verb of PATH_VERBS) {
    test(`${verb.name} never paints outside the screen over 2000 ticks`, () => {
      const m = createSpriteModel(
        sprite({ path: verb.name, count: 3 }),
        STYLES,
        mulberry32(5),
      )
      m.resize(40, 12)
      for (let i = 0; i < 2000; i++) {
        m.tick()
        for (const c of m.cells()) {
          if (c.x < 0 || c.x >= 40 || c.y < 0 || c.y >= 12) {
            throw new Error(`${verb.name} escaped to ${c.x},${c.y}`)
          }
        }
      }
    })

    test(`${verb.name} keeps the sprite on screen at a 26x4 tile`, () => {
      const m = createSpriteModel(
        sprite({ path: verb.name }),
        STYLES,
        mulberry32(5),
      )
      m.resize(26, 4)
      let drew = 0
      for (let i = 0; i < 400; i++) {
        m.tick()
        if (m.cells().length > 0) drew++
      }
      // A sprite that vanishes on the one surface most users see is broken
      // for them, however good it looks at 80x24.
      expect(drew).toBeGreaterThan(200)
    })
  }
})

describe('paths', () => {
  test('descend returns to its start rather than teleporting', () => {
    const at = (t: number) =>
      pathAt('descend', {
        t,
        period: 100,
        w: 40,
        h: 20,
        sw: 7,
        sh: 3,
        x: 0.5,
        y: 0,
        span: 1,
      })
    expect(at(0).y).toBeCloseTo(at(100).y, 5)
    expect(at(50).y).toBeGreaterThan(at(0).y)
    // Halfway back down the second half, not a jump cut.
    expect(at(75).y).toBeLessThan(at(50).y)
  })

  test('an unknown path stands still instead of throwing', () => {
    const p = pathAt('__proto__', {
      t: 5,
      period: 100,
      w: 40,
      h: 20,
      sw: 7,
      sh: 3,
      x: 0.5,
      y: 0.5,
      span: 1,
    })
    expect(Number.isFinite(p.x)).toBe(true)
    expect(Number.isFinite(p.y)).toBe(true)
  })
})

describe('a sprite theme survives being shared', () => {
  test('parses, serialises and reparses with no warnings', () => {
    // /theme export reads the REGISTRY, where art is held as a validated
    // object rather than the array-of-rows a file holds. Without a serialiser
    // that converts it back, exporting a spider produced a file that no
    // longer loaded.
    const file = JSON.stringify({
      mode: 'dark',
      description: 'web-slinger red over midnight blue',
      scene: {
        kind: 'custom',
        label: 'web-swing',
        sprites: [
          {
            frames: SPIDER,
            path: 'descend',
            trailChar: '|',
            color: 'error',
            x: 0.84,
          },
        ],
        fields: [{ motion: 'twinkle', glyphs: 'web', color: 'inactive' }],
      },
      colors: { claude: 'rgb(220,60,60)' },
    })

    const first = loadThemeFromText('test-only-spider', file)
    expect(first.warnings).toEqual([])
    expect(first.theme).not.toBeNull()
    if (first.theme === null) return

    const text = serializeThemeFile({
      mode: first.theme.mode,
      colors: first.theme.theme as unknown as Record<string, string>,
      ...(first.theme.scene !== undefined ? { scene: first.theme.scene } : {}),
    })

    const second = loadThemeFromText('test-only-spider', text)
    expect(second.warnings).toEqual([])
    expect(second.theme).not.toBeNull()
    expect(second.theme?.scene).toEqual(first.theme.scene)
  })
})
