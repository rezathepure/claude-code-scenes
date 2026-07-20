/**
 * Which theme has which scene.
 *
 * The palette registry lives in @anthropic/ink and stores colours only — ink
 * cannot import from src/, so the scene half of a theme lives here, keyed by
 * the same theme name and maintained through the same choke point
 * (src/themes/register.ts). The scene controller looks configs up by the
 * currently active theme name.
 */

import type { SceneConfig } from './types.js'

const SCENES = new Map<string, SceneConfig>()

export function registerScene(name: string, scene: SceneConfig): void {
  SCENES.set(name, scene)
}

export function unregisterScene(name: string): void {
  SCENES.delete(name)
}

/** The scene for a theme; themes without one animate nothing. */
export function getSceneConfig(name: string): SceneConfig {
  return SCENES.get(name) ?? { kind: 'none' }
}

/** Test seam. */
export function clearSceneRegistry(): void {
  SCENES.clear()
}
