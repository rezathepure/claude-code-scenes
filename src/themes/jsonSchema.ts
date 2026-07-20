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

import { PETALS_CLAMPS, RAIN_CLAMPS } from '../scene/types.js'
import { KEY_SLOT_DOCS, SLOT_FAMILIES } from './generate/slotDocs.js'
import { getKnownSlotNames } from './schema.js'

/**
 * Builds the params sub-schema for a scene primitive from its clamp table,
 * so editor autocomplete shows the same mins/maxes/defaults the loader
 * actually enforces — one source of truth for the numbers.
 */
function clampParamsSchema(
  clamps: Record<string, { default: number; min: number; max: number }>,
  descriptions: Record<string, string>,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(clamps)) {
    properties[key] = {
      type: 'number',
      minimum: spec.min,
      maximum: spec.max,
      default: spec.default,
      description: descriptions[key] ?? '',
    }
  }
  return { type: 'object', additionalProperties: false, properties }
}

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
        description:
          'Animated background. A primitive name plus bounded numeric parameters; colours are derived from the palette. Out-of-range values are clamped on load.',
        oneOf: [
          {
            type: 'object',
            required: ['kind'],
            additionalProperties: false,
            properties: { kind: { type: 'string', enum: ['none'] } },
          },
          {
            type: 'object',
            required: ['kind'],
            additionalProperties: false,
            properties: {
              kind: { type: 'string', enum: ['rain'] },
              params: clampParamsSchema(RAIN_CLAMPS, {
                density: 'Drops per column of terminal width.',
                speedMin:
                  'Slowest fall speed, cells per tick (10 ticks/second).',
                speedMax: 'Fastest fall speed, cells per tick.',
                trailMin: 'Shortest trail, cells.',
                trailMax: 'Longest trail, cells.',
                mutateRate: 'Per-glyph chance per tick of mutating.',
              }),
            },
          },
          {
            type: 'object',
            required: ['kind'],
            additionalProperties: false,
            properties: {
              kind: { type: 'string', enum: ['petals'] },
              params: clampParamsSchema(PETALS_CLAMPS, {
                density: 'Petals per 1000 screen cells.',
                fallMin: 'Slowest fall speed, cells per tick.',
                fallMax: 'Fastest fall speed, cells per tick.',
                swayAmp: 'Horizontal sway amplitude, cells.',
                swayPeriod: 'Ticks per full sway cycle.',
                tumblePeriod: 'Ticks per full tumble cycle.',
              }),
            },
          },
        ],
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
