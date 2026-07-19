/**
 * Generates a JSON Schema for theme files.
 *
 * This exists because the file format was not discoverable. A reasonable
 * person hand-writing their first theme guessed `{ name, base, overrides }`
 * instead of `{ mode, colors }`, got no feedback, and their theme simply never
 * appeared. Showing the error afterwards helps; not needing the error at all
 * is better.
 *
 * With `"$schema": "./.schema.json"` at the top of a theme file, any editor
 * with JSON language support offers completion for all ~69 slot names and
 * shows what each one controls on hover — the same prose the model is given in
 * generate/slotDocs.ts. The list is derived from the shipped palette rather
 * than hand-maintained, so it cannot drift as slots are added.
 */

import { KEY_SLOT_DOCS, SLOT_FAMILIES } from './generate/slotDocs.js'
import { getKnownSlotNames } from './schema.js'

/** Filename used inside ~/.claude/themes, hidden so it does not look like a theme. */
export const THEME_SCHEMA_FILENAME = '.schema.json'

/** Relative reference written into theme files. */
export const THEME_SCHEMA_REF = `./${THEME_SCHEMA_FILENAME}`

const COLOR_PATTERN =
  '^(rgb\\(\\s?\\d+,\\s?\\d+,\\s?\\d+\\s?\\)|#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|ansi256\\(\\s?\\d+\\s?\\)|ansi:[a-zA-Z]+)$'

function slotDescription(slot: string): string {
  const doc = KEY_SLOT_DOCS.find(d => d.slot === slot)
  if (doc) {
    return doc.caution ? `${doc.describes}\n\n⚠ ${doc.caution}` : doc.describes
  }

  const family = SLOT_FAMILIES.find(f =>
    f.prefixOrNames.some(p => slot.includes(p) || slot === p),
  )
  if (family) {
    return family.instruction
  }

  return 'A colour slot. See the theme documentation for what it controls.'
}

/**
 * Builds the schema object.
 *
 * Slots are listed as named properties so editors can complete them, but
 * `additionalProperties` stays permissive: a theme written for a newer version
 * of Claude Code should not be shown as invalid just because this build does
 * not know a slot yet. The loader already drops unknown slots with a warning,
 * which is the right severity for it.
 */
export function buildThemeJsonSchema(): Record<string, unknown> {
  const colorProperties: Record<string, unknown> = {}
  for (const slot of getKnownSlotNames()) {
    colorProperties[slot] = {
      type: 'string',
      description: slotDescription(slot),
      pattern: COLOR_PATTERN,
    }
  }

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Claude Code theme',
    description:
      'A colour theme. The filename is the theme name — there is no name field.',
    type: 'object',
    required: ['mode', 'colors'],
    additionalProperties: false,
    properties: {
      $schema: { type: 'string' },
      mode: {
        type: 'string',
        enum: ['dark', 'light'],
        description:
          'The terminal background this theme is designed for. Decides which built-in theme fills any slots you leave out, and which background readability is checked against.',
      },
      description: {
        type: 'string',
        description: 'One line shown next to the theme in /theme.',
      },
      author: { type: 'string' },
      scene: {
        type: 'object',
        description:
          'Reserved for animated backgrounds. Only "none" is accepted today.',
        required: ['kind'],
        additionalProperties: false,
        properties: { kind: { type: 'string', enum: ['none'] } },
      },
      colors: {
        type: 'object',
        description:
          'Slot name to colour. Every slot is optional — anything you omit is taken from the built-in theme for your chosen mode.',
        additionalProperties: { type: 'string' },
        properties: colorProperties,
      },
    },
  }
}

export function serializeThemeJsonSchema(): string {
  return `${JSON.stringify(buildThemeJsonSchema(), null, 2)}\n`
}
