/**
 * Frozen output of the two hand-written scene models.
 *
 * The rest of the suite only proves models are deterministic *against
 * themselves* (two instances on one seed agree). That passes just as happily
 * after a refactor silently changes what rain looks like. These digests pin
 * the actual frames, so when rain and petals become presets in the generic
 * field grammar, "the preset still is the old model" is a test result rather
 * than an opinion.
 *
 * A digest is FNV-1a over (x, y, char, styleId) in array order — order
 * matters because ScenePass truncates by prefix, so a reordering is a real
 * behaviour change even when the set of cells is identical. Cell counts ride
 * along because a bare digest mismatch tells you nothing about what moved.
 *
 * Regenerating these is legitimate ONLY when the visual change is intended
 * and described in the commit message.
 */

import { describe, expect, test } from 'bun:test'
import type { SceneGlyph } from '@anthropic/ink'
import { createFieldModel } from '../field.js'
import { petalsPreset, rainPreset } from '../presets.js'
import { mulberry32 } from '../rng.js'
import { defaultPetalsParams, defaultRainParams } from '../types.js'

/** Same fake styleIds the model tests use, so the two files stay comparable. */
const RAIN_STYLES = { head: 2, ramp: [4, 6, 8, 10, 12, 14] }
const PETAL_STYLES = { head: 2, ramp: [2, 4, 6, 8] }

/** Tick counts sampled: spawn, first step, early, settled, long-run. */
const TICKS = [0, 1, 10, 50, 200] as const

function digest(cells: ReadonlyArray<SceneGlyph>): number {
  let h = 0x811c9dc5
  for (const c of cells) {
    const s = `${c.x},${c.y},${c.char},${c.styleId};`
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
  }
  return h >>> 0
}

type Case = {
  kind: 'rain' | 'petals'
  seed: number
  w: number
  h: number
  /** [digest, cellCount] per entry in TICKS. */
  samples: ReadonlyArray<readonly [number, number]>
}

/**
 * 80x24 is a normal terminal, 40x12 a split pane, and 26x4 is the theme
 * picker tile — the only surface most users ever see, since the full scene
 * needs alt-screen.
 */
const CASES: readonly Case[] = [
  {
    kind: 'rain',
    seed: 7,
    w: 80,
    h: 24,
    samples: [
      [3740832529, 120],
      [2503181612, 127],
      [2813143396, 194],
      [2265042224, 189],
      [1899742187, 190],
    ],
  },
  {
    kind: 'rain',
    seed: 7,
    w: 40,
    h: 12,
    samples: [
      [1112371502, 31],
      [3151011185, 34],
      [559215542, 59],
      [174521024, 49],
      [2680835547, 44],
    ],
  },
  {
    kind: 'rain',
    seed: 7,
    w: 26,
    h: 4,
    samples: [
      [1202880184, 4],
      [3013959483, 5],
      [2728204322, 9],
      [3266710532, 10],
      [1485923079, 20],
    ],
  },
  {
    kind: 'rain',
    seed: 123,
    w: 80,
    h: 24,
    samples: [
      [3587871056, 148],
      [2877317622, 156],
      [342043341, 198],
      [1186419158, 265],
      [2639687116, 172],
    ],
  },
  {
    kind: 'rain',
    seed: 123,
    w: 40,
    h: 12,
    samples: [
      [101188914, 33],
      [1398172976, 35],
      [676562659, 58],
      [511452062, 94],
      [2912521973, 61],
    ],
  },
  {
    kind: 'rain',
    seed: 123,
    w: 26,
    h: 4,
    samples: [
      [2700331956, 5],
      [1608296941, 7],
      [2528608423, 13],
      [1354186852, 14],
      [2881484683, 19],
    ],
  },
  {
    kind: 'petals',
    seed: 7,
    w: 80,
    h: 24,
    samples: [
      [595422450, 14],
      [2449253631, 14],
      [2760517046, 13],
      [1118122306, 10],
      [1902213920, 13],
    ],
  },
  {
    kind: 'petals',
    seed: 7,
    w: 40,
    h: 12,
    samples: [
      [187335631, 4],
      [187335631, 4],
      [2342457558, 4],
      [3714787173, 2],
      [2672973626, 3],
    ],
  },
  {
    kind: 'petals',
    seed: 7,
    w: 26,
    h: 4,
    samples: [
      [1988812340, 1],
      [1988812340, 1],
      [722650240, 1],
      [2668441708, 1],
      [1536150949, 1],
    ],
  },
  {
    kind: 'petals',
    seed: 123,
    w: 80,
    h: 24,
    samples: [
      [456556246, 14],
      [2347997528, 14],
      [1446743130, 14],
      [374453143, 12],
      [930015904, 8],
    ],
  },
  {
    kind: 'petals',
    seed: 123,
    w: 40,
    h: 12,
    samples: [
      [2964632026, 4],
      [701553443, 4],
      [3029351157, 4],
      [1294290216, 3],
      [918637418, 1],
    ],
  },
  {
    kind: 'petals',
    seed: 123,
    w: 26,
    h: 4,
    samples: [
      [1012109501, 1],
      [1012109501, 1],
      [1129076312, 1],
      // Nothing on screen at all: one petal, swayed out of bounds. See the
      // "petals nearly vanish" test below.
      [2166136261, 0],
      [799998113, 1],
    ],
  },
]

/**
 * Built through the GRAMMAR, not through the models these digests were
 * captured from. That is the point of this file now: the numbers below were
 * recorded from the hand-written rain.ts and petals.ts, and they still pass
 * through `createFieldModel` driven by a preset. The two shipped animations
 * survived being turned into data.
 */
function build(c: Case) {
  return c.kind === 'rain'
    ? createFieldModel(
        rainPreset(defaultRainParams()),
        RAIN_STYLES,
        mulberry32(c.seed),
      )
    : createFieldModel(
        petalsPreset(defaultPetalsParams()),
        PETAL_STYLES,
        mulberry32(c.seed),
      )
}

describe('frozen scene output', () => {
  for (const c of CASES) {
    test(`${c.kind} seed ${c.seed} at ${c.w}x${c.h} renders the frames it always has`, () => {
      const m = build(c)
      m.resize(c.w, c.h)
      let t = 0
      for (let i = 0; i < TICKS.length; i++) {
        const target = TICKS[i]!
        while (t < target) {
          m.tick()
          t++
        }
        const [expectedDigest, expectedCount] = c.samples[i]!
        // Count first: it localises most failures to "how much" before the
        // digest tells you only "something".
        expect({ tick: target, count: m.cells().length }).toEqual({
          tick: target,
          count: expectedCount,
        })
        expect({ tick: target, digest: digest(m.cells()) }).toEqual({
          tick: target,
          digest: expectedDigest,
        })
      }
    })
  }
})

describe('the picker tile is a real surface', () => {
  test('rain still reads as rain at 26x4', () => {
    // The tile is 26x4 and, for anyone not running alt-screen, it is the
    // ONLY place a scene is ever visible. A preset that only works at 80x24
    // is a preset most users never see working.
    const m = build({ kind: 'rain', seed: 7, w: 26, h: 4, samples: [] })
    m.resize(26, 4)
    let total = 0
    for (let i = 0; i < 200; i++) {
      m.tick()
      total += m.cells().length
    }
    expect(total / 200).toBeGreaterThan(4)
  })

  test('petals nearly vanish at 26x4 — documented, not endorsed', () => {
    // density 7.5 per 1000 cells over 104 cells rounds to a single petal,
    // which sway can push off-screen entirely. Pinned so the field grammar's
    // density floor has something to improve on rather than silently match.
    const m = build({ kind: 'petals', seed: 123, w: 26, h: 4, samples: [] })
    m.resize(26, 4)
    let empty = 0
    for (let i = 0; i < 200; i++) {
      m.tick()
      if (m.cells().length === 0) empty++
    }
    expect(empty).toBeGreaterThan(0)
  })
})
