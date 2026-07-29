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

import {
  FIELD_PARAMS,
  MAX_FIELDS,
  MAX_SHADERS,
  MAX_SPRITES,
  type ParamTable,
  SCENE_COLOR_SLOTS,
  SHADER_PARAMS,
  SPRITE_PARAMS,
} from '../scene/grammar.js'
import { PETALS_CLAMPS, RAIN_CLAMPS } from '../scene/types.js'
import { KEY_SLOT_DOCS, SLOT_FAMILIES } from './generate/slotDocs.js'
import { getKnownSlotNames } from './schema.js'

/**
 * Builds a params sub-schema from a grammar table, so editor autocomplete
 * shows the same mins/maxes/defaults/prose the loader actually enforces.
 *
 * The prose used to live here as a second hand-maintained table keyed by the
 * same names — two lists to keep in step, and they had already diverged from
 * the prompt. It lives in the table now; this just renders it.
 */
function paramTableSchema(table: ParamTable): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(table)) {
    switch (spec.type) {
      case 'number':
      case 'int':
        properties[key] = {
          type: spec.type === 'int' ? 'integer' : 'number',
          minimum: spec.min,
          maximum: spec.max,
          default: spec.default,
          description: spec.describe,
        }
        break
      case 'enum':
        properties[key] = {
          type: 'string',
          enum: [...spec.values],
          default: spec.default,
          description: spec.describe,
        }
        break
      case 'slot':
        properties[key] = {
          type: 'string',
          enum: [...SCENE_COLOR_SLOTS],
          default: spec.default,
          description: spec.describe,
        }
        break
      case 'char':
      case 'text':
      case 'expr':
        properties[key] = {
          type: 'string',
          default: spec.default,
          description: spec.describe,
        }
        break
      case 'frames':
        properties[key] = {
          type: 'array',
          maxItems: spec.maxFrames,
          items: {
            type: 'array',
            maxItems: spec.maxRows,
            items: { type: 'string', maxLength: spec.maxCols },
          },
          description: spec.describe,
        }
        break
    }
  }
  return { type: 'object', additionalProperties: false, properties }
}

/** One array of layers, for the composed-scene arm. */
function layerArraySchema(
  table: ParamTable,
  max: number,
  description: string,
): Record<string, unknown> {
  return {
    type: 'array',
    maxItems: max,
    description,
    items: paramTableSchema(table),
  }
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
              params: paramTableSchema(RAIN_CLAMPS),
            },
          },
          {
            type: 'object',
            required: ['kind'],
            additionalProperties: false,
            properties: {
              kind: { type: 'string', enum: ['petals'] },
              params: paramTableSchema(PETALS_CLAMPS),
            },
          },
          {
            // The composed scene. Unlike the preset arms this one is
            // deliberately OPEN (`additionalProperties` unset): a theme
            // written by a newer build must not show as invalid in an editor
            // just because this build has not learned its layer type yet —
            // the loader accepts-and-warns, and the schema should agree.
            type: 'object',
            required: ['kind'],
            properties: {
              kind: { type: 'string', enum: ['custom'] },
              label: {
                type: 'string',
                description:
                  'Two or three words naming the animation, shown beside the theme in the picker.',
              },
              fields: layerArraySchema(
                FIELD_PARAMS,
                MAX_FIELDS,
                'Particle layers: weather, circuitry, embers, stars, dust.',
              ),
              sprites: layerArraySchema(
                SPRITE_PARAMS,
                MAX_SPRITES,
                'Drawn art animated along a path. A space is transparent.',
              ),
              shaders: layerArraySchema(
                SHADER_PARAMS,
                MAX_SHADERS,
                'A maths expression evaluated per cell, giving a brightness.',
              ),
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
