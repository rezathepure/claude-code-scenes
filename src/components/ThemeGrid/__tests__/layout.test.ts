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
  type GridEntry,
  groupBands,
  moveIndex,
  rowHeight,
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
    sceneKind: 'none',
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
  // 7 entries in 3 columns:  0 1 2 / 3 4 5 / 6
  const count = 7
  const cols = 3

  test('left/right step and flow across rows', () => {
    expect(moveIndex(0, 'left', count, cols)).toBe(0)
    expect(moveIndex(2, 'right', count, cols)).toBe(3) // flows to next row
    expect(moveIndex(6, 'right', count, cols)).toBe(6)
  })

  test('up/down step by a column count', () => {
    expect(moveIndex(4, 'up', count, cols)).toBe(1)
    expect(moveIndex(1, 'down', count, cols)).toBe(4)
    expect(moveIndex(0, 'up', count, cols)).toBe(0) // top clamps
  })

  test('the partial last row is reachable from every column', () => {
    // Down from 4 or 5 (columns with no tile below) lands on the last entry.
    expect(moveIndex(3, 'down', count, cols)).toBe(6)
    expect(moveIndex(4, 'down', count, cols)).toBe(6)
    expect(moveIndex(5, 'down', count, cols)).toBe(6)
    expect(moveIndex(6, 'down', count, cols)).toBe(6)
  })

  test('empty grid never explodes', () => {
    expect(moveIndex(0, 'down', 0, 3)).toBe(0)
  })
})

describe('groupBands', () => {
  test('animation trumps origin and bands keep their order', () => {
    const entries = [
      entry({ value: 'dark' }),
      entry({ value: 'test-only-anim', sceneKind: 'rain', origin: 'bundled' }),
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
      entry({ value: 'a', sceneKind: 'rain' }),
      entry({ value: 'b', sceneKind: 'petals' }),
      entry({ value: 'c', sceneKind: 'rain' }),
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
        },
      },
      { origin: 'cc' },
    )
    registered.push('test-only-grid-anim')

    const entries = buildGridEntries(BUILTINS)
    const anim = entries.find(e => e.value === 'test-only-grid-anim')

    expect(entries[0]).toMatchObject({ value: 'dark', origin: 'builtin' })
    expect(anim).toMatchObject({
      sceneKind: 'rain',
      origin: 'cc',
      mode: 'dark',
    })
  })

  test('rowHeight adds one line for a header', () => {
    const rows = buildRows(groupBands([entry({ value: 'dark' })]), 2)
    expect(rowHeight(rows[0]!)).toBe(8)
  })
})
