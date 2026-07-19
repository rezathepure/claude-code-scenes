import { describe, expect, test } from 'bun:test'
import { buildThemeJsonSchema, THEME_SCHEMA_REF } from '../jsonSchema.js'
import { loadThemeFromText } from '../loader.js'
import { getKnownSlotNames } from '../schema.js'
import { serializeThemeFile } from '../save.js'

const schema = buildThemeJsonSchema()
const colorProps = (
  schema.properties as Record<string, Record<string, unknown>>
).colors.properties as Record<string, { description: string; pattern: string }>

describe('the theme JSON Schema', () => {
  test('lists every slot the app actually has', () => {
    // Derived from the shipped palette rather than hand-maintained, so a slot
    // added later cannot go missing from editor completion.
    expect(Object.keys(colorProps).sort()).toEqual(getKnownSlotNames().sort())
  })

  test('describes what each slot controls, for editor hover', () => {
    for (const [slot, prop] of Object.entries(colorProps)) {
      expect(prop.description.length).toBeGreaterThan(10)
      expect(prop.description).not.toContain('undefined')
      expect(slot.length).toBeGreaterThan(0)
    }
  })

  test('carries the caution text for slots that are easy to misread', () => {
    // `background` is the trap: it sounds like a backdrop and is a task status
    // colour. Anyone hand-editing deserves the same warning the model gets.
    expect(colorProps.background!.description).toContain('NOT a page')
  })

  test('accepts every colour notation the renderer supports', () => {
    const pattern = new RegExp(colorProps.text!.pattern)
    for (const valid of [
      'rgb(0,255,65)',
      'rgb(255, 138, 190)',
      '#00ff41',
      '#0f4',
      'ansi256(9)',
      'ansi:redBright',
    ]) {
      expect(pattern.test(valid)).toBe(true)
    }
  })

  test('rejects notations that would render uncoloured', () => {
    const pattern = new RegExp(colorProps.text!.pattern)
    expect(pattern.test('rebeccapurple')).toBe(false)
    expect(pattern.test('rgb(1,  2,  3)')).toBe(false)
  })

  test('requires only mode and colors, so short files stay valid', () => {
    expect(schema.required).toEqual(['mode', 'colors'])
  })

  test('tolerates slots it does not know about', () => {
    // A theme written for a newer build should not be flagged as invalid; the
    // loader already handles unknown slots with a warning, which is the right
    // severity for it.
    const colors = (
      schema.properties as Record<string, Record<string, unknown>>
    ).colors
    expect(colors.additionalProperties).toEqual({ type: 'string' })
  })
})

describe('$schema round trip', () => {
  test('a saved theme points at the schema file', () => {
    const file = serializeThemeFile({
      mode: 'dark',
      colors: { claude: 'rgb(0,255,65)' },
    })
    expect(JSON.parse(file).$schema).toBe(THEME_SCHEMA_REF)
  })

  test('and reloads without complaining about the extra key', () => {
    // The whole point would be lost if adding $schema made the file fail to
    // load, or produced a warning every launch.
    const file = serializeThemeFile({
      mode: 'dark',
      colors: { claude: 'rgb(0,255,65)' },
    })
    const { theme, warnings } = loadThemeFromText('round-trip', file)

    expect(warnings).toEqual([])
    expect(theme).not.toBeNull()
    expect((theme!.theme as unknown as Record<string, string>).claude).toBe(
      'rgb(0,255,65)',
    )
  })
})
