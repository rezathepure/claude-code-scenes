/**
 * The `scene` half of the tool schema sent to the model.
 *
 * Built from the grammar tables, like everything else that describes the
 * scene format, so the schema cannot advertise a range the loader does not
 * enforce.
 *
 * **No `oneOf` or `anyOf` anywhere.** That is not stylistic. sideQuery routes
 * to the OpenAI/Grok/Gemini adapters for non-Anthropic providers, and Gemini's
 * sanitizer folds `oneOf` into `anyOf`, drops empty `required` and drops empty
 * `additionalProperties` — so a discriminated union survives structurally and
 * degrades semantically, which is the worst of both. One flat object with
 * three optional arrays of flat objects passes through every adapter intact.
 *
 * Descriptions are terser here than in the system prompt on purpose: the
 * prompt teaches, the schema only has to disambiguate, and this is sent on
 * every single call.
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
} from '../../scene/grammar.js'

function propsFor(table: ParamTable): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(table)) {
    switch (spec.type) {
      case 'number':
      case 'int':
        properties[key] = {
          type: spec.type === 'int' ? 'integer' : 'number',
          minimum: spec.min,
          maximum: spec.max,
          description: spec.describe,
        }
        break
      case 'enum':
        properties[key] = {
          type: 'string',
          enum: [...spec.values],
          description: spec.describe,
        }
        break
      case 'slot':
        properties[key] = {
          type: 'string',
          enum: [...SCENE_COLOR_SLOTS],
          description: spec.describe,
        }
        break
      case 'char':
      case 'text':
      case 'expr':
        properties[key] = { type: 'string', description: spec.describe }
        break
      case 'frames':
        properties[key] = {
          type: 'array',
          maxItems: spec.maxFrames,
          items: {
            type: 'array',
            maxItems: spec.maxRows,
            items: { type: 'string' },
          },
          description: spec.describe,
        }
        break
    }
  }
  return properties
}

function layerArray(
  table: ParamTable,
  max: number,
  required: readonly string[],
  description: string,
): Record<string, unknown> {
  return {
    type: 'array',
    maxItems: max,
    description,
    items: {
      type: 'object',
      properties: propsFor(table),
      ...(required.length > 0 ? { required: [...required] } : {}),
    },
  }
}

export function buildSceneToolSchema(): Record<string, unknown> {
  return {
    type: 'object',
    description:
      'The animation. Compose fields (texture), sprites (a drawn subject) and shaders (a rhythm) — most scenes use two or three layers. Use kind "none" only for ideas that ask for stillness. Colours come from the palette automatically.',
    properties: {
      kind: {
        type: 'string',
        enum: ['none', 'custom', 'rain', 'petals'],
        description:
          'Use "custom" whenever you supply layers, or "none" for a still theme. "rain" and "petals" are legacy shorthands kept for old files; prefer designing layers.',
      },
      label: {
        type: 'string',
        description:
          'Two or three words naming the animation, shown beside the theme in the picker.',
      },
      fields: layerArray(
        FIELD_PARAMS,
        MAX_FIELDS,
        ['motion'],
        'Particle layers: weather, circuitry, embers, stars, dust.',
      ),
      sprites: layerArray(
        SPRITE_PARAMS,
        MAX_SPRITES,
        ['frames'],
        'Drawn art animated along a path. Rows must all be the same width; a space is transparent. ASCII, box drawing and blocks only — no emoji or wide characters.',
      ),
      shaders: layerArray(
        SHADER_PARAMS,
        MAX_SHADERS,
        ['expr'],
        'A maths expression evaluated per cell, giving a brightness.',
      ),
    },
    required: ['kind'],
  }
}
