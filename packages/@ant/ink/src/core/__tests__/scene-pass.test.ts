import { describe, expect, test } from 'bun:test'
import {
  blitRegion,
  cellAt,
  CellWidth,
  CharPool,
  createScreen,
  HyperlinkPool,
  isEmptyCellAt,
  type Screen,
  setCellAt,
  shiftRows,
  StylePool,
} from '../screen'
import {
  SCENE_STYLE_MARKER,
  type SceneGlyph,
  type SceneModel,
  ScenePass,
} from '../scene-pass'

const FG: { type: 'ansi'; code: string; endCode: string } = {
  type: 'ansi',
  code: '\x1b[38;2;0;255;65m',
  endCode: '\x1b[39m',
}

function makeScreen(
  width = 20,
  height = 10,
): { screen: Screen; pool: StylePool; chars: CharPool; links: HyperlinkPool } {
  const pool = new StylePool()
  const chars = new CharPool()
  const links = new HyperlinkPool()
  return {
    screen: createScreen(width, height, pool, chars, links),
    pool,
    chars,
    links,
  }
}

/** A model that paints a fixed set of glyphs; tick() shifts them right. */
function fixedModel(
  glyphs: SceneGlyph[],
): SceneModel & { ticks: number; resizes: Array<[number, number]> } {
  let current = glyphs
  const model = {
    ticks: 0,
    resizes: [] as Array<[number, number]>,
    resize(w: number, h: number) {
      model.resizes.push([w, h])
    },
    tick() {
      model.ticks++
      current = current.map(g => ({ ...g, x: g.x + 1 }))
    },
    cells: () => current as ReadonlyArray<SceneGlyph>,
  }
  return model
}

function sceneStyle(pool: StylePool, pass: ScenePass): number {
  const id = pool.intern([FG, SCENE_STYLE_MARKER])
  pass.markSceneStyle(id)
  return id
}

describe('the marker invariant', () => {
  test('marker-interned styles get ids no plain style can produce', () => {
    const pool = new StylePool()
    const plain = pool.intern([FG])
    const marked = pool.intern([FG, SCENE_STYLE_MARKER])

    expect(marked).not.toBe(plain)
    // Re-interning either form is stable.
    expect(pool.intern([FG])).toBe(plain)
    expect(pool.intern([FG, SCENE_STYLE_MARKER])).toBe(marked)
  })

  test('the marker changes nothing about the emitted bytes', () => {
    const pool = new StylePool()
    const plain = pool.intern([FG])
    const marked = pool.intern([FG, SCENE_STYLE_MARKER])

    // Transition from default to each must be identical SGR output —
    // the marker exists only to make the id distinct.
    expect(pool.transition(0, marked)).toBe(pool.transition(0, plain))
  })
})

describe('painting', () => {
  test('paints only into empty cells', () => {
    const { screen, pool } = makeScreen()
    const pass = new ScenePass()
    const style = sceneStyle(pool, pass)

    // Occupy (2,1) with real content.
    const textStyle = pool.intern([FG]) // same colour, no marker
    setCellAt(screen, 2, 1, {
      char: 'X',
      styleId: textStyle,
      width: CellWidth.Narrow,
      hyperlink: undefined,
    })

    pass.setModel(
      fixedModel([
        { x: 2, y: 1, char: 'ｱ', styleId: style }, // occupied → refused
        { x: 5, y: 5, char: 'ｲ', styleId: style }, // empty → painted
      ]),
    )
    pass.apply(screen)

    expect(cellAt(screen, 2, 1)?.char).toBe('X')
    expect(cellAt(screen, 5, 5)?.char).toBe('ｲ')
  })

  test('marks painted cells noSelect and clears it on erase', () => {
    const { screen, pool } = makeScreen()
    const pass = new ScenePass()
    const style = sceneStyle(pool, pass)

    pass.setModel(fixedModel([{ x: 3, y: 3, char: 'ｱ', styleId: style }]))
    pass.apply(screen)
    expect(screen.noSelect[3 * screen.width + 3]).toBe(1)

    pass.setModel(null)
    pass.apply(screen)
    expect(screen.noSelect[3 * screen.width + 3]).toBe(0)
    expect(isEmptyCellAt(screen, 3, 3)).toBe(true)
  })

  test('out-of-bounds glyphs are dropped silently', () => {
    const { screen, pool } = makeScreen(10, 5)
    const pass = new ScenePass()
    const style = sceneStyle(pool, pass)

    pass.setModel(
      fixedModel([
        { x: -1, y: 2, char: 'ｱ', styleId: style },
        { x: 50, y: 2, char: 'ｱ', styleId: style },
        { x: 2, y: 99, char: 'ｱ', styleId: style },
      ]),
    )
    expect(() => pass.apply(screen)).not.toThrow()
  })

  test('honors the per-frame budget with deterministic truncation', () => {
    // 20x10 = 200 cells → fractional cap = 30.
    const { screen, pool } = makeScreen()
    const pass = new ScenePass()
    const style = sceneStyle(pool, pass)

    const many: SceneGlyph[] = []
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 20; x++) {
        many.push({ x, y, char: 'ｱ', styleId: style })
      }
    }
    pass.setModel(fixedModel(many))
    pass.apply(screen)

    let painted = 0
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 20; x++) {
        if (!isEmptyCellAt(screen, x, y)) painted++
      }
    }
    expect(painted).toBe(30)
    // Priority order: the first 30 glyphs of cells(), not an arbitrary 30.
    expect(isEmptyCellAt(screen, 0, 0)).toBe(false)
    expect(isEmptyCellAt(screen, 19, 9)).toBe(true)
  })
})

describe('stability between ticks', () => {
  test('two applies without a tick leave the buffer byte-identical', () => {
    const { screen, pool } = makeScreen()
    const pass = new ScenePass()
    const style = sceneStyle(pool, pass)

    pass.setModel(
      fixedModel([
        { x: 4, y: 4, char: 'ｱ', styleId: style },
        { x: 7, y: 2, char: 'ﾈ', styleId: style },
      ]),
    )
    pass.apply(screen)
    const snapshot = screen.cells.slice()

    pass.apply(screen) // erase + identical repaint
    expect(screen.cells).toEqual(snapshot)
  })

  test('a tick moves the glyph: old cell empty, new cell painted', () => {
    const { screen, pool } = makeScreen()
    const pass = new ScenePass()
    const style = sceneStyle(pool, pass)
    const model = fixedModel([{ x: 4, y: 4, char: 'ｱ', styleId: style }])

    pass.setModel(model)
    pass.apply(screen)
    model.tick() // x: 4 → 5
    pass.apply(screen)

    expect(isEmptyCellAt(screen, 4, 4)).toBe(true)
    expect(cellAt(screen, 5, 4)?.char).toBe('ｱ')
  })
})

describe('resurrection defense (the reason ownership is by styleId)', () => {
  test('erases glyphs a blit copied forward from the previous frame', () => {
    const { screen: prev, pool, chars, links } = makeScreen()
    const pass = new ScenePass()
    const style = sceneStyle(pool, pass)
    const model = fixedModel([{ x: 6, y: 3, char: 'ｱ', styleId: style }])

    pass.setModel(model)
    pass.apply(prev)

    // Next frame: a clean node blits its whole rect — glyph comes along.
    const next = createScreen(20, 10, pool, chars, links)
    blitRegion(next, prev, 0, 0, 20, 10)
    expect(cellAt(next, 6, 3)?.char).toBe('ｱ')

    model.tick() // glyph should now be at x=7
    pass.apply(next)

    expect(isEmptyCellAt(next, 6, 3)).toBe(true) // stale copy swept
    expect(cellAt(next, 7, 3)?.char).toBe('ｱ')
  })

  test('erases glyphs a scroll RELOCATED — the case that kills coord lists', () => {
    const { screen: prev, pool, chars, links } = makeScreen()
    const pass = new ScenePass()
    const style = sceneStyle(pool, pass)
    const model = fixedModel([{ x: 6, y: 5, char: 'ｱ', styleId: style }])

    pass.setModel(model)
    pass.apply(prev)

    // Scroll fast path: blit forward, then shift rows up by 2. The glyph
    // lands at (6,3) — a coordinate the scene never painted.
    const next = createScreen(20, 10, pool, chars, links)
    blitRegion(next, prev, 0, 0, 20, 10)
    shiftRows(next, 0, 9, 2)
    expect(cellAt(next, 6, 3)?.char).toBe('ｱ')

    pass.apply(next) // no tick — same frame, just a scrolled render

    expect(isEmptyCellAt(next, 6, 3)).toBe(true) // orphan swept anyway
    expect(cellAt(next, 6, 5)?.char).toBe('ｱ') // current position repainted
  })

  test('never sweeps real text drawn in the same colour without the marker', () => {
    const { screen, pool } = makeScreen()
    const pass = new ScenePass()
    const style = sceneStyle(pool, pass)
    const textStyle = pool.intern([FG]) // identical colour, unmarked

    setCellAt(screen, 8, 8, {
      char: 'ア',
      styleId: textStyle,
      width: CellWidth.Narrow,
      hyperlink: undefined,
    })
    pass.setModel(fixedModel([{ x: 1, y: 1, char: 'ｱ', styleId: style }]))
    pass.apply(screen)
    pass.apply(screen)

    expect(cellAt(screen, 8, 8)?.char).toBe('ア')
  })
})

describe('lifecycle', () => {
  test('setModel(null) erases everything in one apply, then goes dormant', () => {
    const { screen, pool } = makeScreen()
    const pass = new ScenePass()
    const style = sceneStyle(pool, pass)

    pass.setModel(fixedModel([{ x: 2, y: 2, char: 'ｱ', styleId: style }]))
    pass.apply(screen)
    expect(pass.active).toBe(true)

    pass.setModel(null)
    expect(pass.active).toBe(true) // still has cleanup to do
    pass.apply(screen)

    expect(isEmptyCellAt(screen, 2, 2)).toBe(true)
    expect(pass.active).toBe(false) // provably scene-free → dormant
  })

  test('a new model learns dimensions before its first paint', () => {
    const { screen, pool } = makeScreen(33, 7)
    const pass = new ScenePass()
    const style = sceneStyle(pool, pass)
    const model = fixedModel([{ x: 0, y: 0, char: 'ｱ', styleId: style }])

    pass.setModel(model)
    pass.apply(screen)

    expect(model.resizes).toEqual([[33, 7]])
  })

  test('dimension changes propagate as resize', () => {
    const { pool, chars, links } = makeScreen()
    const pass = new ScenePass()
    const style = sceneStyle(pool, pass)
    const model = fixedModel([{ x: 0, y: 0, char: 'ｱ', styleId: style }])

    pass.setModel(model)
    pass.apply(createScreen(20, 10, pool, chars, links))
    pass.apply(createScreen(40, 12, pool, chars, links))

    expect(model.resizes).toEqual([
      [20, 10],
      [40, 12],
    ])
  })

  test('damage is present after any paint or erase', () => {
    const { screen, pool } = makeScreen()
    const pass = new ScenePass()
    const style = sceneStyle(pool, pass)

    screen.damage = undefined
    pass.setModel(fixedModel([{ x: 2, y: 2, char: 'ｱ', styleId: style }]))
    pass.apply(screen)
    expect(screen.damage).toBeDefined()

    screen.damage = undefined
    pass.setModel(null)
    pass.apply(screen)
    expect(screen.damage).toBeDefined()
  })
})
