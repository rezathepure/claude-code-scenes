import { afterEach, describe, expect, test } from 'bun:test'
import { getTheme } from '../../../utils/theme.js'
import {
  registerThemeWithTraits,
  unregisterThemeWithTraits,
} from '../../../themes/register.js'
import {
  buildGridEntries,
  buildRows,
  columnCountFor,
  computeWindowStart,
  CREATE_TILE_VALUE,
  flattenBands,
  type GridEntry,
  groupBands,
  moveIndex,
  rowHeight,
  rowIndexOf,
} from '../layout.js'

const registered: string[] = []
afterEach(() => {
  while (registered.length > 0) {
    unregisterThemeWithTraits(registered.pop()!)
  }
})

const BUILTINS = [
  { label: 'Dark mode', value: 'dark' as const },
  { label: 'Light mode', value: 'light' as const },
]

function entry(partial: Partial<GridEntry> & { value: string }): GridEntry {
  return {
    paletteName: partial.value,
    label: partial.value,
    mode: 'dark',
    sceneLabel: null,
    origin: 'builtin',
    ...partial,
    value: partial.value as GridEntry['value'],
  }
}

describe('columnCountFor', () => {
  test('too narrow means list fallback', () => {
    expect(columnCountFor(59)).toBe(0)
  })

  test('scales 2-4 with width and caps at 4', () => {
    expect(columnCountFor(60)).toBe(2)
    expect(columnCountFor(87)).toBe(3)
    expect(columnCountFor(116)).toBe(4)
    expect(columnCountFor(400)).toBe(4)
  })
})

describe('moveIndex', () => {
  // One band, 7 entries in 3 columns:  0 1 2 / 3 4 5 / 6
  const uniform = buildRows(
    groupBands(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(v => entry({ value: v })),
    ),
    3,
  )

  test('left/right step and flow across rows', () => {
    expect(moveIndex(uniform, 0, 'left')).toBe(0)
    expect(moveIndex(uniform, 2, 'right')).toBe(3) // flows to next row
    expect(moveIndex(uniform, 6, 'right')).toBe(6)
  })

  test('up/down move within the same column', () => {
    expect(moveIndex(uniform, 4, 'up')).toBe(1)
    expect(moveIndex(uniform, 1, 'down')).toBe(4)
    expect(moveIndex(uniform, 0, 'up')).toBe(0) // top clamps
  })

  test('a shorter row below clamps to its last tile', () => {
    expect(moveIndex(uniform, 3, 'down')).toBe(6)
    expect(moveIndex(uniform, 4, 'down')).toBe(6)
    expect(moveIndex(uniform, 5, 'down')).toBe(6)
    expect(moveIndex(uniform, 6, 'down')).toBe(6)
  })

  test('vertical moves land on the tile visually below across band breaks', () => {
    // Regression for the live layout: a two-tile Animated band above a full
    // Built-in band in 3 columns. ±columnCount arithmetic put "down from
    // matrix" on the middle of the builtin row instead of directly below.
    //   [anim1, anim2]        (row 0: 0 1)
    //   [c, d, e]             (row 1: 2 3 4)
    //   [f, g]                (row 2: 5 6)
    const banded = buildRows(
      groupBands([
        entry({ value: 'anim1', sceneLabel: 'rain' }),
        entry({ value: 'anim2', sceneLabel: 'petals' }),
        ...['c', 'd', 'e', 'f', 'g'].map(v => entry({ value: v })),
      ]),
      3,
    )

    expect(moveIndex(banded, 0, 'down')).toBe(2) // anim1 → c, same column
    expect(moveIndex(banded, 1, 'down')).toBe(3) // anim2 → d
    expect(moveIndex(banded, 2, 'up')).toBe(0)
    expect(moveIndex(banded, 3, 'up')).toBe(1)
    expect(moveIndex(banded, 4, 'up')).toBe(1) // shorter row above clamps
    expect(moveIndex(banded, 4, 'down')).toBe(6) // shorter row below clamps
    expect(moveIndex(banded, 6, 'down')).toBe(6) // bottom clamps
  })

  test('empty grid never explodes', () => {
    expect(moveIndex([], 0, 'down')).toBe(0)
  })
})

describe('flattenBands', () => {
  test('matches the row order buildRows renders', () => {
    const bands = groupBands([
      entry({ value: 'dark' }),
      entry({ value: 'anim', sceneLabel: 'rain' }),
      entry({ value: 'mine', origin: 'cc' }),
    ])
    const flat = flattenBands(bands)
    const rows = buildRows(bands, 2)

    // The flat order every focus index refers to must be exactly the order
    // the rows draw — this equivalence is what makes selection apply the
    // tile the user is looking at.
    expect(rows.flatMap(r => r.entries.map(e => e.value))).toEqual(
      flat.map(e => e.value),
    )
    expect(flat.map(e => e.value)).toEqual(['anim', 'dark', 'mine'])
    for (const row of rows) {
      for (let i = 0; i < row.entries.length; i++) {
        expect(rowIndexOf(rows, row.flatStart + i)).toBe(rows.indexOf(row))
      }
    }
  })
})

describe('groupBands', () => {
  test('animation trumps origin and bands keep their order', () => {
    const entries = [
      entry({ value: 'dark' }),
      entry({ value: 'test-only-anim', sceneLabel: 'rain', origin: 'bundled' }),
      entry({ value: 'test-only-mine', origin: 'cc' }),
      entry({ value: 'test-only-theirs', origin: 'official' }),
      entry({ value: 'test-only-parch', origin: 'bundled' }),
    ]

    const bands = groupBands(entries)

    expect(bands.map(b => b.key)).toEqual([
      'animated',
      'builtin',
      'custom',
      'official',
    ])
    expect(bands[0]!.entries.map(e => e.value)).toEqual(['test-only-anim'])
    // Non-animated bundled reads as shipped-with-the-app.
    expect(bands[1]!.entries.map(e => e.value)).toEqual([
      'dark',
      'test-only-parch',
    ])
  })

  test('empty bands are omitted', () => {
    const bands = groupBands([entry({ value: 'dark' })])
    expect(bands.map(b => b.key)).toEqual(['builtin'])
  })
})

describe('buildRows', () => {
  test('chunks per band with headers on first rows and continuous flatStart', () => {
    const entries = [
      entry({ value: 'a', sceneLabel: 'rain' }),
      entry({ value: 'b', sceneLabel: 'petals' }),
      entry({ value: 'c', sceneLabel: 'rain' }),
      entry({ value: 'd' }),
    ]
    const rows = buildRows(groupBands(entries), 2)

    // animated: [a,b], [c] — then builtin: [d]
    expect(rows.map(r => r.entries.map(e => e.value))).toEqual([
      ['a', 'b'],
      ['c'],
      ['d'],
    ])
    expect(rows.map(r => r.flatStart)).toEqual([0, 2, 3])
    expect(rows.map(r => r.header)).toEqual([
      '✦ Animated',
      undefined,
      'Built-in',
    ])
  })
})

describe('computeWindowStart', () => {
  test('keeps the focused row visible and moves minimally', () => {
    const heights = [8, 7, 7, 7] // first row has a band header
    // Budget for ~2 rows: focusing row 2 forces the window down.
    expect(computeWindowStart(0, 0, heights, 15)).toBe(0)
    expect(computeWindowStart(0, 1, heights, 15)).toBe(0)
    expect(computeWindowStart(0, 2, heights, 15)).toBe(1)
    // Scrolling back up pulls the window up only as far as needed.
    expect(computeWindowStart(1, 0, heights, 15)).toBe(0)
    // A stable window is not disturbed when focus stays inside it.
    expect(computeWindowStart(1, 2, heights, 15)).toBe(1)
  })
})

describe('buildGridEntries', () => {
  test('carries builtin options first and registered themes after, with meta', () => {
    registerThemeWithTraits(
      'test-only-grid-anim',
      getTheme('dark'),
      'dark',
      {
        kind: 'rain',
        params: {
          density: 0.33,
          speedMin: 0.3,
          speedMax: 1.2,
          trailMin: 6,
          trailMax: 26,
          mutateRate: 0.01,
          intensity: 1,
        },
      },
      { origin: 'cc' },
    )
    registered.push('test-only-grid-anim')

    const entries = buildGridEntries(BUILTINS)
    const anim = entries.find(e => e.value === 'test-only-grid-anim')

    expect(entries[0]).toMatchObject({ value: 'dark', origin: 'builtin' })
    expect(anim).toMatchObject({
      sceneLabel: 'rain',
      origin: 'cc',
      mode: 'dark',
    })
  })

  test('rowHeight adds one line for a header', () => {
    const rows = buildRows(groupBands([entry({ value: 'dark' })]), 2)
    expect(rowHeight(rows[0]!)).toBe(8)
  })

  test('the create tile is opt-in and closes the Animated band', () => {
    // Absent unless asked for — onboarding and /config show a plain grid.
    const plain = buildGridEntries(BUILTINS)
    expect(plain.some(e => e.special === 'create')).toBe(false)

    const withCreate = buildGridEntries(BUILTINS, { includeCreate: true })
    const create = withCreate[withCreate.length - 1]!
    expect(create).toMatchObject({
      special: 'create',
      value: CREATE_TILE_VALUE,
      label: 'Create your own',
    })

    // The showcase themes lead the band; the invitation follows them.
    const bands = groupBands([
      entry({ value: 'test-only-rainy', sceneLabel: 'rain' }),
      create,
    ])
    expect(bands[0]!.key).toBe('animated')
    expect(bands[0]!.entries.map(e => e.value)).toEqual([
      'test-only-rainy',
      CREATE_TILE_VALUE,
    ])
  })
})
