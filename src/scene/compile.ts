/**
 * Turns a parsed scene config into a running model.
 *
 * This is the ONLY place styles are interned and layer models are built, and
 * that is deliberate on two counts.
 *
 * Interning has a hard ceiling: a styleId is packed into 15 bits and interned
 * styles are never evicted, so a little over 8000 distinct styles exist for
 * the whole process before the packed word overflows into the sign bit and
 * starts corrupting lookups for real UI text. Keeping every `internSceneStyle`
 * call in one function, run once per theme activation, is what makes that
 * ceiling unreachable — a shader that interned per computed colour per frame
 * would reach it in minutes.
 *
 * The legacy `rain` and `petals` kinds are desugared here rather than at parse
 * time, so the file on disk keeps saying `{"kind": "rain"}` and `/theme
 * export` round-trips it unchanged.
 */

import type { SceneModel } from '@anthropic/ink'
import {
  deriveFieldStyles,
  deriveSolidStyle,
  type SceneStyleInterner,
} from './colors.js'
import { type CompositePart, createCompositeModel } from './composite.js'
import { createFieldModel } from './field.js'
import { petalsPreset, rainPreset } from './presets.js'
import { mulberry32 } from './rng.js'
import { compileExpression } from './expr/index.js'
import { createShaderModel } from './shader.js'
import { createSpriteModel } from './sprite.js'
import type {
  CustomScene,
  FieldLayer,
  SceneConfig,
  ShaderLayer,
  SpriteLayer,
} from './types.js'

/**
 * Total opacity a scene may spend across its layers.
 *
 * Intensity is per-layer and therefore additive: three layers at 0.7 are not
 * "0.7 opacity", they are three overlapping textures at 0.7, and the
 * conversation stops being readable. Models reliably overspend it, so rather
 * than rejecting the theme we scale the whole scene down proportionally —
 * the balance BETWEEN layers is the interesting part of the design, and that
 * is preserved. The prompt says this happens, so the model is not fighting an
 * invisible clamp.
 */
const INTENSITY_BUDGET = 1.6

/** Golden-ratio odd constant: a cheap, well-spread stream separator. */
const STREAM_SALT = 0x9e3779b9

function normalise(config: SceneConfig): CustomScene | null {
  switch (config.kind) {
    case 'none':
      return null
    case 'rain':
      return {
        label: 'rain',
        fields: [rainPreset(config.params)],
        sprites: [],
        shaders: [],
      }
    case 'petals':
      return {
        label: 'petals',
        fields: [petalsPreset(config.params)],
        sprites: [],
        shaders: [],
      }
    case 'custom':
      return config.scene
  }
}

/** Scales every layer down when the scene as a whole is too loud. */
function balance(scene: CustomScene): CustomScene {
  let spent = 0
  for (const f of scene.fields) spent += f.intensity
  for (const s of scene.shaders) spent += s.intensity
  if (spent <= INTENSITY_BUDGET) return scene

  const k = INTENSITY_BUDGET / spent
  return {
    ...scene,
    fields: scene.fields.map(f => ({ ...f, intensity: f.intensity * k })),
    shaders: scene.shaders.map(s => ({ ...s, intensity: s.intensity * k })),
  }
}

/**
 * Builds the model for a theme's scene, or null when nothing animates.
 *
 * Each layer gets its OWN rng stream derived from the seed rather than
 * sharing one. A shared stream would make every layer's output depend on how
 * many values the layers before it happened to draw, so adding a shader would
 * silently change what the rain looks like — and the golden digests, which
 * pin exactly that, would become impossible to reason about. Layer 0's stream
 * is the raw seed, which is why a single-layer preset still matches the
 * output the hand-written models produced.
 */
export function compileScene(
  config: SceneConfig,
  theme: Record<string, string>,
  ink: SceneStyleInterner,
  seed: number,
): SceneModel | null {
  const normalised = normalise(config)
  if (normalised === null) return null

  const scene = balance(normalised)
  const parts: CompositePart[] = []
  let index = 0

  for (const layer of scene.fields) {
    parts.push(buildField(layer, theme, ink, streamSeed(seed, index)))
    index++
  }
  for (const layer of scene.sprites) {
    parts.push(buildSprite(layer, theme, ink, streamSeed(seed, index)))
    index++
  }
  for (const layer of scene.shaders) {
    const part = buildShader(layer, theme, ink)
    // A shader whose expression will not compile is dropped rather than
    // allowed to paint nothing: the parse already warned at load time.
    if (part !== null) parts.push(part)
    index++
  }

  if (parts.length === 0) return null
  // One layer needs no compositor, and going straight through keeps a preset
  // byte-identical to the model it replaced.
  if (parts.length === 1) return parts[0]!.model

  return createCompositeModel(parts)
}

/** Layer 0 gets the raw seed, so a single-layer preset is unchanged. */
function streamSeed(seed: number, index: number): number {
  return (seed ^ (index * STREAM_SALT)) >>> 0
}

function buildField(
  layer: FieldLayer,
  theme: Record<string, string>,
  ink: SceneStyleInterner,
  seed: number,
): CompositePart {
  const styles = deriveFieldStyles(
    theme,
    ink,
    layer.color,
    layer.fade,
    layer.intensity,
  )
  return {
    model: createFieldModel(layer, styles, mulberry32(seed)),
    weight: layer.weight,
    reserved: false,
    priority: layer.priority,
  }
}

function buildSprite(
  layer: SpriteLayer,
  theme: Record<string, string>,
  ink: SceneStyleInterner,
  seed: number,
): CompositePart {
  return {
    model: createSpriteModel(
      layer,
      {
        body: deriveSolidStyle(theme, ink, layer.color, layer.intensity),
        trail: deriveSolidStyle(
          theme,
          ink,
          layer.trailColor,
          layer.intensity * 0.6,
        ),
      },
      mulberry32(seed),
    ),
    // Sprites take their natural size off the top rather than competing for
    // a share: a spider that loses its legs to a dense rain is not a spider.
    weight: 1,
    reserved: true,
    priority: layer.priority,
  }
}

function buildShader(
  layer: ShaderLayer,
  theme: Record<string, string>,
  ink: SceneStyleInterner,
): CompositePart | null {
  const compiled = compileExpression(layer.expr)
  if (!compiled.ok) return null

  // Exactly `levels` styles, interned once, and the model never sees the
  // interner — see shader.ts for why that separation is load-bearing.
  const styles: number[] = []
  for (let i = 0; i < layer.levels; i++) {
    const k = layer.levels === 1 ? 1 : i / (layer.levels - 1)
    styles.push(
      deriveSolidStyle(
        theme,
        ink,
        layer.color,
        layer.intensity * (0.45 + 0.55 * k),
      ),
    )
  }

  return {
    model: createShaderModel(layer, compiled.evaluate, styles),
    weight: layer.weight,
    reserved: false,
    priority: layer.priority,
  }
}
