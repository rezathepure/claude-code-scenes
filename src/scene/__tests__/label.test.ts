/**
 * What the UI says about a scene.
 *
 * `sceneLabelOf` names it; `describeScene` says what it is made of. The second
 * exists because the animation preview is a small box and a sparse scene can
 * put three characters in it — you cannot tell from that what to ask for next.
 * The prose can, so it has to name the vocabulary a refinement would use:
 * motions, glyph catalogs, colour slots.
 */

import { describe, expect, test } from 'bun:test'
import { loadThemeFromText } from '../../themes/loader.js'
import type { SceneConfig } from '../types.js'
import { describeScene, sceneLabelOf } from '../label.js'

/**
 * Builds a scene the way the loader would, so the fixture is a real clamped
 * SceneConfig rather than seventeen hand-written FieldLayer fields that would
 * drift from the grammar.
 */
function sceneFromFile(scene: unknown): SceneConfig | undefined {
  const loaded = loadThemeFromText(
    'test-only-describe',
    JSON.stringify({ mode: 'dark', scene, colors: {} }),
  )
  const errors = loaded.warnings.filter(w => w.severity === 'error')
  expect(errors).toEqual([])
  return loaded.theme?.scene
}

describe('sceneLabelOf', () => {
  test('names the legacy presets and a still theme', () => {
    expect(sceneLabelOf(undefined)).toBeNull()
    expect(sceneLabelOf({ kind: 'none' })).toBeNull()
    expect(sceneLabelOf(sceneFromFile({ kind: 'rain' }))).toBe('rain')
    expect(sceneLabelOf(sceneFromFile({ kind: 'petals' }))).toBe('petals')
  })

  test('prefers the model’s own label, and falls back to the parts', () => {
    const labelled = sceneFromFile({
      kind: 'custom',
      label: 'neon drizzle',
      fields: [{ motion: 'fall', glyphs: 'katakana', color: 'claude' }],
    })
    expect(sceneLabelOf(labelled)).toBe('neon drizzle')

    const unlabelled = sceneFromFile({
      kind: 'custom',
      fields: [{ motion: 'drift', glyphs: 'petals', color: 'claude' }],
    })
    expect(sceneLabelOf(unlabelled)).toBe('drift')
  })
})

describe('describeScene', () => {
  test('says nothing about a theme that does not animate', () => {
    expect(describeScene(undefined)).toEqual([])
    expect(describeScene({ kind: 'none' })).toEqual([])
  })

  test('one line per layer type, naming motion, catalog and slot', () => {
    const scene = sceneFromFile({
      kind: 'custom',
      label: 'storm',
      fields: [
        { motion: 'fall', glyphs: 'katakana', color: 'claude' },
        { motion: 'twinkle', glyphs: 'sparks', color: 'subtle' },
      ],
      shaders: [{ expr: 'sin(t)', glyphs: 'blocks', color: 'error' }],
    })

    expect(describeScene(scene)).toEqual([
      '2 fields · fall (katakana, claude) · twinkle (sparks, subtle)',
      '1 shader · blocks in error',
    ])
  })

  test('counts a sprite’s frames — the number you would ask to change', () => {
    const scene = sceneFromFile({
      kind: 'custom',
      label: 'web-swing',
      sprites: [
        {
          frames: [
            [' /\\ ', '(oo)'],
            [' \\/ ', '(oo)'],
          ],
          path: 'descend',
          color: 'error',
        },
      ],
    })

    expect(describeScene(scene)).toEqual([
      '1 sprite · descend (2 frames, error)',
    ])
  })

  test('a legacy preset describes itself in the same shape', () => {
    const lines = describeScene(sceneFromFile({ kind: 'rain' }))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('katakana')
  })
})
