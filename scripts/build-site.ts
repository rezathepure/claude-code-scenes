/**
 * Assembles the GitHub Pages site into _site/.
 *
 * Deliberately not a bundler: the page is one hand-written HTML file with
 * inline CSS and a few lines of JS, so "the build" is copying it next to the
 * scene assets it references.
 *
 * The demos are regenerated from the engine first (see capture-scene.ts), so
 * a deploy cannot show an animation the code no longer produces.
 *
 *   bun run site:build       # then open _site/index.html
 */

import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const OUT = join(ROOT, '_site')

async function main(): Promise<void> {
  await rm(OUT, { recursive: true, force: true })
  await mkdir(join(OUT, 'assets', 'scenes'), { recursive: true })

  await cp(join(ROOT, 'site', 'index.html'), join(OUT, 'index.html'))

  const scenes = join(ROOT, 'assets', 'scenes')
  const svgs = (await readdir(scenes)).filter(f => f.endsWith('.svg'))
  if (svgs.length === 0) {
    throw new Error('no scene SVGs — run `bun run capture:scenes` first')
  }
  for (const file of svgs) {
    await cp(join(scenes, file), join(OUT, 'assets', 'scenes', file))
  }

  // Tells GitHub Pages not to run the output through Jekyll, which would
  // otherwise strip files and directories beginning with an underscore.
  await Bun.write(join(OUT, '.nojekyll'), '')

  console.log(`_site/  index.html + ${svgs.length} scenes`)
}

await main()
