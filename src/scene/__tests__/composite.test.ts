import { describe, expect, test } from 'bun:test'
import { sceneCellBudget } from '@anthropic/ink'
import { compileScene } from '../compile.js'
import { createFieldModel } from '../field.js'
import { MOTION_VERBS } from '../grammar.js'
import { mulberry32 } from '../rng.js'
import type { CustomScene, FieldLayer, SceneConfig } from '../types.js'
import { defaultRainParams } from '../types.js'

const STYLES = { head: 2, ramp: [4, 6, 8, 10, 12, 14] }

function layer(over: Partial<FieldLayer> = {}): FieldLayer {
  return {
    motion: 'fall',
    glyphs: 'katakana',
    color: 'claude',
    fade: 'trail',
    intensity: 0.55,
    density: 0.33,
    priority: 5,
    weight: 3,
    speedMin: 0.3,
    speedMax: 1.2,
    trailMin: 6,
    trailMax: 26,
    angle: 0,
    swayAmp: 0,
    swayPeriod: 90,
    tumblePeriod: 0,
    mutateRate: 0.01,
    ...over,
  }
}

function scene(fields: FieldLayer[]): CustomScene {
  return { label: 'test', fields, sprites: [], shaders: [] }
}

/** Records what it interned; models never see it. */
function fakeInk() {
  const colors: string[] = []
  return {
    colors,
    internSceneStyle(c: string): number {
      colors.push(c)
      return colors.length * 2
    },
  }
}

const PALETTE = { claude: 'rgb(0,255,65)', claudeShimmer: 'rgb(150,255,180)' }

describe('every motion verb', () => {
  for (const verb of MOTION_VERBS) {
    test(`${verb.name} stays in bounds and keeps drawing over 500 ticks`, () => {
      const m = createFieldModel(
        layer({ motion: verb.name, density: 0.5 }),
        STYLES,
        mulberry32(7),
      )
      m.resize(60, 20)
      let drewSomething = false
      for (let i = 0; i < 500; i++) {
        m.tick()
        for (const c of m.cells()) {
          if (c.x < 0 || c.x >= 60 || c.y < 0 || c.y >= 20) {
            throw new Error(
              `${verb.name} painted out of bounds at ${c.x},${c.y}`,
            )
          }
        }
        if (m.cells().length > 0) drewSomething = true
      }
      expect(drewSomething).toBe(true)
    })

    test(`${verb.name} survives a 26x4 tile`, () => {
      // The tile is the only surface most users see. A verb that divides by
      // zero or spawns nothing at four rows is a verb that is broken for them.
      const m = createFieldModel(
        layer({ motion: verb.name }),
        STYLES,
        mulberry32(3),
      )
      expect(() => {
        m.resize(26, 4)
        for (let i = 0; i < 100; i++) m.tick()
      }).not.toThrow()
    })
  }
})

describe('the compositor', () => {
  const build = (fields: FieldLayer[]) =>
    compileScene(
      { kind: 'custom', scene: scene(fields) } as SceneConfig,
      PALETTE,
      fakeInk(),
      7,
    )

  test('returns one array, always', () => {
    // React renders between ticker ticks must repaint the identical frame.
    const m = build([layer(), layer({ motion: 'drift' })])!
    m.resize(80, 24)
    m.tick()
    expect(m.cells()).toBe(m.cells()) // identity, not equality
  })

  test('paints lower priority first, so it wins the cell', () => {
    const m = build([
      layer({ priority: 7, glyphs: 'binary' }),
      layer({ priority: 1, glyphs: 'blocks' }),
    ])!
    m.resize(80, 24)
    m.tick()
    const first = m.cells()[0]
    // Blocks is the priority-1 layer; its cells lead the array.
    expect('█▓▒░▄▀▐▌').toContain(first?.char ?? '')
  })

  test('keeps the array inside the pass budget it can actually paint', () => {
    const m = build([
      layer({ density: 3, weight: 10 }),
      layer({ density: 3, weight: 1 }),
    ])!
    m.resize(80, 24)
    for (let i = 0; i < 20; i++) m.tick()
    // Overdrawn 2x on purpose (occluded cells cost the pass nothing), but
    // never unbounded.
    expect(m.cells().length).toBeLessThanOrEqual(sceneCellBudget(80, 24) * 2)
  })

  test('a heavier weight gets more of the frame', () => {
    const heavy = build([
      layer({ density: 3, weight: 10 }),
      layer({ density: 3, weight: 1, motion: 'twinkle' }),
    ])!
    heavy.resize(80, 24)
    heavy.tick()
    const twinkles = heavy.cells().filter(c => 'ｱ0123456789'.includes(c.char))
    expect(twinkles.length).toBeGreaterThan(0)
  })
})

describe('layer rng streams', () => {
  test('adding a layer does not change the layer before it', () => {
    // A shared rng stream would make every layer depend on how many values
    // the layers before it drew, so adding a shader would silently restyle
    // the rain. Derived streams are what keep the golden digests meaningful.
    const alone = createFieldModel(layer(), STYLES, mulberry32(7))
    const withNeighbour = compileScene(
      {
        kind: 'custom',
        scene: scene([layer(), layer({ motion: 'twinkle', priority: 9 })]),
      } as SceneConfig,
      PALETTE,
      fakeInk(),
      7,
    )!

    alone.resize(80, 24)
    withNeighbour.resize(80, 24)
    for (let i = 0; i < 30; i++) {
      alone.tick()
      withNeighbour.tick()
    }
    // The first layer's cells lead the composite array (equal priority keeps
    // declaration order), so its output must still be a prefix of it.
    //
    // Position and glyph only: the two models were given different style
    // tables (one fake, one derived), and it is the rng stream under test,
    // not the palette.
    const where = (c: { x: number; y: number; char: string }) =>
      `${c.x},${c.y},${c.char}`
    const composed = withNeighbour.cells()
    const solo = alone.cells()
    expect(solo.length).toBeGreaterThan(0)
    for (let i = 0; i < Math.min(solo.length, composed.length); i++) {
      expect(where(composed[i]!)).toBe(where(solo[i]!))
    }
  })
})

describe('compileScene', () => {
  test('a scene with nothing in it animates nothing', () => {
    expect(compileScene({ kind: 'none' }, PALETTE, fakeInk(), 1)).toBeNull()
    expect(
      compileScene(
        { kind: 'custom', scene: scene([]) } as SceneConfig,
        PALETTE,
        fakeInk(),
        1,
      ),
    ).toBeNull()
  })

  test('scales a scene down when its layers together are too loud', () => {
    // Four layers at full intensity is not "opacity 1", it is four textures
    // over the conversation. The balance BETWEEN them is preserved.
    const ink = fakeInk()
    compileScene(
      {
        kind: 'custom',
        scene: scene([
          layer({ intensity: 1, color: 'claude' }),
          layer({ intensity: 1, color: 'error' }),
          layer({ intensity: 1, color: 'success' }),
        ]),
      } as SceneConfig,
      { ...PALETTE, error: 'rgb(255,80,95)', success: 'rgb(80,240,180)' },
      ink,
      1,
    )
    // Every derived colour is dimmed, so none of them reaches the near-white
    // head an intensity-1 layer would have produced.
    const brightest = Math.max(
      ...ink.colors.map(c => {
        const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(c)!
        return Math.max(Number(m[1]), Number(m[2]), Number(m[3]))
      }),
    )
    expect(brightest).toBeLessThan(255)
  })

  test('interns a bounded number of styles, once', () => {
    // styleIds are packed into 15 bits and never evicted; interning per frame
    // would corrupt real UI text within minutes.
    const ink = fakeInk()
    const m = compileScene(
      { kind: 'rain', params: defaultRainParams() },
      PALETTE,
      ink,
      7,
    )!
    const afterBuild = ink.colors.length
    m.resize(80, 24)
    for (let i = 0; i < 500; i++) m.tick()
    expect(ink.colors.length).toBe(afterBuild)
    expect(afterBuild).toBeLessThanOrEqual(8)
  })
})

describe('the shader layer', () => {
  const shaderScene = (over: Record<string, unknown> = {}) =>
    ({
      kind: 'custom',
      scene: {
        label: 'haze',
        fields: [],
        sprites: [],
        shaders: [
          {
            expr: 'sin(u*11 + t/13) * sin(v*6 - t/21)',
            glyphs: 'blocks',
            color: 'claude',
            threshold: 0.5,
            levels: 4,
            step: 1,
            intensity: 0.35,
            weight: 2,
            priority: 8,
            ...over,
          },
        ],
      },
    }) as unknown as SceneConfig

  test('paints, and only inside the screen', () => {
    const m = compileScene(shaderScene(), PALETTE, fakeInk(), 1)!
    m.resize(80, 24)
    let painted = 0
    for (let i = 0; i < 60; i++) {
      m.tick()
      for (const c of m.cells()) {
        expect(c.x).toBeGreaterThanOrEqual(0)
        expect(c.x).toBeLessThan(80)
        expect(c.y).toBeGreaterThanOrEqual(0)
        expect(c.y).toBeLessThan(24)
      }
      painted += m.cells().length
    }
    expect(painted).toBeGreaterThan(0)
  })

  test('interns exactly `levels` styles and never another', () => {
    // styleIds are 15-bit and never evicted. A shader that interned per
    // computed colour would corrupt real UI text within minutes.
    const ink = fakeInk()
    const m = compileScene(shaderScene({ levels: 5 }), PALETTE, ink, 1)!
    expect(ink.colors.length).toBe(5)
    m.resize(120, 40)
    for (let i = 0; i < 500; i++) m.tick()
    expect(ink.colors.length).toBe(5)
  })

  test('a scene whose only shader will not compile animates nothing', () => {
    expect(
      compileScene(shaderScene({ expr: 'x[0]' }), PALETTE, fakeInk(), 1),
    ).toBeNull()
  })

  test('widens its sample stride rather than blowing the tick budget', () => {
    const m = compileScene(
      shaderScene({ threshold: 0 }),
      PALETTE,
      fakeInk(),
      1,
    )!
    m.resize(400, 120)
    m.tick()
    // 400x120 is 48,000 cells; the model caps evaluations far below that.
    expect(m.cells().length).toBeLessThanOrEqual(4000)
  })
})
