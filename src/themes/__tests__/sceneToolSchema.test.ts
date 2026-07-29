import { describe, expect, test } from 'bun:test'
import {
  anthropicToolsToGemini,
  anthropicToolsToOpenAI,
} from '@ant/model-provider'
import {
  MAX_FIELDS,
  MAX_SHADERS,
  MAX_SPRITES,
  MOTION_VERBS,
} from '../../scene/grammar.js'
import { buildSceneToolSchema } from '../generate/sceneToolSchema.js'

const scene = buildSceneToolSchema() as Record<string, any>

const asTool = () =>
  [
    {
      name: 'create_theme',
      description: 'test',
      input_schema: {
        type: 'object' as const,
        properties: { scene },
        required: [],
      },
    },
  ] as never

describe('the scene tool schema', () => {
  test('offers every motion verb the loader accepts', () => {
    // Generated from the same table the loader clamps against: a verb the
    // model is never told about is a verb that does not exist.
    expect(scene.properties.fields.items.properties.motion.enum).toEqual([
      ...MOTION_VERBS.map(v => v.name),
    ])
  })

  test('bounds every layer array', () => {
    expect(scene.properties.fields.maxItems).toBe(MAX_FIELDS)
    expect(scene.properties.sprites.maxItems).toBe(MAX_SPRITES)
    expect(scene.properties.shaders.maxItems).toBe(MAX_SHADERS)
  })

  test('uses no oneOf or anyOf anywhere', () => {
    // Gemini's sanitizer folds oneOf into anyOf and drops empty `required`
    // and `additionalProperties`, so a discriminated union survives
    // structurally and degrades semantically. One flat object avoids the
    // whole question.
    expect(JSON.stringify(scene)).not.toMatch(/oneOf|anyOf/)
  })
})

describe('surviving the provider adapters', () => {
  test('Gemini keeps the enums that make the grammar usable', () => {
    const [tool] = anthropicToolsToGemini(asTool()) as Array<
      Record<string, any>
    >
    const params =
      tool?.functionDeclarations?.[0]?.parametersJsonSchema ??
      tool?.functionDeclarations?.[0]?.parameters
    const motion =
      params?.properties?.scene?.properties?.fields?.items?.properties?.motion
    expect(motion?.enum).toContain('fall')
    expect(motion?.enum).toContain('twinkle')
    expect(JSON.stringify(params)).not.toMatch(/anyOf/)
  })

  test('OpenAI-compatible endpoints keep the sprite frame shape', () => {
    // Frames are array-of-array-of-string; a sanitizer that flattened it
    // would make every sprite unparseable on those providers.
    const [tool] = anthropicToolsToOpenAI(asTool()) as Array<
      Record<string, any>
    >
    const frames =
      tool?.function?.parameters?.properties?.scene?.properties?.sprites?.items
        ?.properties?.frames
    expect(frames?.type).toBe('array')
    expect(frames?.items?.type).toBe('array')
    expect(frames?.items?.items?.type).toBe('string')
  })
})
