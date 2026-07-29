import { describe, expect, test } from 'bun:test'
import type { Color } from '@anthropic/ink'
import { defaultPetalsParams, defaultRainParams } from '../../../scene/types.js'
import { createTileScene } from '../TileScene.js'

const PALETTE = {
  claude: 'rgb(0,255,65)',
  claudeShimmer: 'rgb(150,255,180)',
  text: 'rgb(200,245,205)',
} as unknown as Record<string, Color>

const RAIN = { kind: 'rain', params: defaultRainParams() } as const
const PETALS = { kind: 'petals', params: defaultPetalsParams() } as const

describe('createTileScene', () => {
  test('every derived colour is a renderable rgb() string', () => {
    const { colors } = createTileScene(RAIN, PALETTE, 26, 4, 1)
    expect(colors.length).toBeGreaterThan(0)
    for (const c of colors) {
      expect(c).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
    }
  })

  test('every cell styleId indexes into the colour table', () => {
    for (const config of [RAIN, PETALS]) {
      const { model, colors } = createTileScene(config, PALETTE, 26, 4, 2)
      for (let i = 0; i < 50; i++) model!.tick()
      for (const cell of model!.cells()) {
        expect(cell.styleId).toBeGreaterThanOrEqual(0)
        expect(cell.styleId).toBeLessThan(colors.length)
      }
    }
  })

  test('cells stay within tile bounds across 50 ticks', () => {
    const { model } = createTileScene(PETALS, PALETTE, 26, 4, 3)
    for (let i = 0; i < 50; i++) {
      model!.tick()
      for (const cell of model!.cells()) {
        expect(cell.x).toBeGreaterThanOrEqual(0)
        expect(cell.x).toBeLessThan(26)
        expect(cell.y).toBeGreaterThanOrEqual(0)
        expect(cell.y).toBeLessThan(4)
      }
    }
  })

  test('is deterministic for a given seed', () => {
    const a = createTileScene(RAIN, PALETTE, 26, 4, 42)
    const b = createTileScene(RAIN, PALETTE, 26, 4, 42)
    for (let i = 0; i < 20; i++) {
      a.model!.tick()
      b.model!.tick()
    }
    expect(a.model!.cells()).toEqual(b.model!.cells())
    expect(a.colors).toEqual(b.colors)
  })
})
