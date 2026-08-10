/**
 * Assembles the GitHub Pages site into _site/.
 *
 * Deliberately not a bundler: the page is one hand-written HTML file with
 * inline CSS and one inline script, so "the build" is copying it next to the
 * captures it references.
 *
 * Those captures are committed rather than regenerated here. They are produced
 * from the real interface over the real scene engine by `capture:demo` and
 * `capture:starters`, but encoding them needs headless Chrome and ffmpeg, and
 * the Pages runner has neither. Committing them also keeps the page and the
 * README showing the same frames.
 *
 *   bun run site:build       # then open _site/index.html
 */

import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const OUT = join(ROOT, '_site')

/** Everything the page can reference; anything else in assets/demo is a draft. */
const MEDIA = /\.(gif|mp4|png)$/

async function main(): Promise<void> {
  await rm(OUT, { recursive: true, force: true })
  await mkdir(join(OUT, 'assets', 'demo'), { recursive: true })

  await cp(join(ROOT, 'site', 'index.html'), join(OUT, 'index.html'))
  await cp(join(ROOT, 'site', 'favicon.svg'), join(OUT, 'favicon.svg'))

  const demo = join(ROOT, 'assets', 'demo')
  const media = (await readdir(demo)).filter(f => MEDIA.test(f))
  if (media.length === 0) {
    throw new Error('no captures in assets/demo — run `bun run capture:demo`')
  }
  for (const file of media) {
    await cp(join(demo, file), join(OUT, 'assets', 'demo', file))
  }

  // Tells GitHub Pages not to run the output through Jekyll, which would
  // otherwise strip files and directories beginning with an underscore.
  await Bun.write(join(OUT, '.nojekyll'), '')

  console.log(`_site/  index.html + favicon + ${media.length} captures`)
}

await main()
