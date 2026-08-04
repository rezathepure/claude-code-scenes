/**
 * Writes the animated SVG for each capture — the landing-page assets.
 *
 * The encoding lives in scripts/lib/scene-svg.ts, shared with the GIF path so
 * the two formats cannot drift.
 *
 *   bun run scripts/render-scene-svg.ts
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SceneCapture } from './capture-scene.ts'
import { renderAnimatedSvg } from './lib/scene-svg.ts'

const DIR = join(import.meta.dir, '..', 'assets', 'scenes')

async function main(): Promise<void> {
  const names = (await readdir(DIR))
    .filter(f => f.endsWith('.json'))
    .map(f => f.slice(0, -'.json'.length))
    .sort()

  if (names.length === 0) {
    throw new Error('no captures in assets/scenes — run capture-scene.ts first')
  }

  for (const name of names) {
    const capture = JSON.parse(
      await readFile(join(DIR, `${name}.json`), 'utf-8'),
    ) as SceneCapture

    const svg = renderAnimatedSvg(capture)
    await writeFile(join(DIR, `${name}.svg`), svg)

    const kb = (Buffer.byteLength(svg) / 1024).toFixed(0)
    console.log(
      `${name.padEnd(10)} ${String(capture.frames.length).padStart(3)} frames · ${kb.padStart(4)} KB`,
    )
  }
}

await main()
