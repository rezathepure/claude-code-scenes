/**
 * Captures the bundled themes' animations as data, for the README and the
 * landing page.
 *
 * The pitch of this project is visual, so the marketing material has to show
 * the animation. Screen-recording a terminal would produce something nobody
 * can regenerate: it drifts from the code the moment a preset changes, and
 * "re-record the GIFs" is a step everyone forgets. So the frames are captured
 * from the real engine instead.
 *
 * That is possible because the scene layer already has a headless seam. The
 * renderer's only dependency on colour is `internSceneStyle(color) -> id`
 * (src/scene/colors.ts), so passing an interner that just remembers what it
 * was handed turns the engine's styleIds back into concrete colours. And a
 * SceneModel is resize/tick/cells with no terminal anywhere in it. Nothing
 * here reaches into the engine's internals or reimplements any of it: this
 * runs exactly the code a user's terminal runs, and the output is pinned by
 * src/scene/__tests__/golden.test.ts.
 *
 * Output is deterministic — one seed, no clock, no randomness of its own — so
 * a re-run produces a byte-identical file and a diff means the animation
 * genuinely changed.
 *
 *   bun run scripts/capture-scene.ts
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sceneCellBudget } from '@anthropic/ink'
import { compileScene } from '../src/scene/compile.js'
import type { SceneStyleInterner } from '../src/scene/colors.js'
import { sceneLabelOf } from '../src/scene/label.js'
import { loadThemeFromText } from '../src/themes/loader.js'
import matrix from '../src/themes/bundled/matrix.json'
import parchment from '../src/themes/bundled/parchment.json'
import sakura from '../src/themes/bundled/sakura.json'
import voltage from '../src/themes/bundled/voltage.json'

/**
 * Same shape and order as src/themes/bundled/index.ts. Duplicated as a plain
 * list rather than imported because that module's registration path reads
 * global config and writes into the ink registry — side effects a capture
 * script has no business triggering.
 */
const BUNDLED: ReadonlyArray<readonly [string, unknown]> = [
  ['matrix', matrix],
  ['sakura', sakura],
  ['parchment', parchment],
  ['voltage', voltage],
]

/**
 * 80x24 is a normal terminal and one of the sizes golden.test.ts pins, so a
 * capture that looks wrong here is a real regression rather than an artefact
 * of an unusual viewport. It is also close enough to 10:3 to sit in a README
 * without dominating it.
 */
const WIDTH = 80
const HEIGHT = 24

/**
 * Long enough that the slowest layer completes a cycle and the loop point is
 * not obvious. voltage's scan field moves at 0.06 cells/tick, so anything
 * much shorter reads as a still image with noise on top.
 */
const FRAMES = 120

/**
 * Ticks run and thrown away before capturing, so frame 0 is a settled scene
 * rather than the spawn state.
 *
 * This is insurance for the static case. A field starts nearly empty and
 * fills as drops spawn, so an un-warmed capture opens on a near-blank frame —
 * and any viewer that does not run the animation (an SVG rasteriser, a reader
 * honouring prefers-reduced-motion) would show exactly that frame and make
 * the theme look like it does nothing.
 */
const WARMUP = 60

/** The seed golden.test.ts pins, so both exercise the same engine path. */
const SEED = 7

/**
 * Stand-ins for a real terminal. A hair off pure black and pure white,
 * because a scene's dimmest ramp step against #000 is the one case where an
 * asset can look broken while the product is behaving correctly.
 */
const DARK_CANVAS = 'rgb(13,13,14)'
const LIGHT_CANVAS = 'rgb(250,249,247)'

const OUT_DIR = join(import.meta.dir, '..', 'assets', 'scenes')

/** One cell of one frame: [x, y, char, paletteIndex]. */
type CapturedCell = readonly [number, number, string, number]

export type SceneCapture = {
  name: string
  description: string
  mode: 'dark' | 'light'
  /** The scene's own label ("neon drizzle"), when it has one. */
  label?: string
  width: number
  height: number
  /**
   * What to paint the demo's terminal on. Claude Code never paints a
   * background — src/themes/canvas.ts: "the terminal's own stays put" — and
   * the `background` colour slot is an accent (cyan in the built-ins), not a
   * canvas. So this is the renderer's stand-in for a real terminal, chosen by
   * mode, and is deliberately not read from the theme.
   */
  canvas: string
  /** The theme's main text colour, for chrome drawn beside the animation. */
  foreground: string
  /** styleId -> CSS colour. Indices are what appears in `frames`. */
  palette: string[]
  /** `frames[i]` is every cell painted on frame i. May be empty. */
  frames: CapturedCell[][]
}

/**
 * Records every colour the compiler asks to intern and hands back its index.
 *
 * Deduped, so the palette stays small enough to inline into an SVG. The real
 * interner packs ids into 15 bits and never evicts; here the only requirement
 * is that the same colour always gets the same id.
 */
function createCaptureInterner(): {
  ink: SceneStyleInterner
  palette: string[]
} {
  const seen = new Map<string, number>()
  const palette: string[] = []
  return {
    palette,
    ink: {
      internSceneStyle(color: string): number {
        const hit = seen.get(color)
        if (hit !== undefined) return hit
        const id = palette.length
        palette.push(color)
        seen.set(color, id)
        return id
      },
    },
  }
}

function capture(name: string, data: unknown): SceneCapture {
  // Round-trip through text for the same reason bundled/index.ts does: one
  // load path, so a capture cannot silently diverge from what /theme shows.
  const result = loadThemeFromText(name, JSON.stringify(data))
  if (result.theme === null) {
    throw new Error(`theme "${name}" failed to load — the pipeline is broken`)
  }
  for (const warning of result.warnings) {
    // Bundled themes are asserted warning-free by the test suite, so anything
    // here is a regression worth failing the capture over rather than
    // baking into an asset.
    throw new Error(`theme "${name}" warned: ${warning.message}`)
  }

  const loaded = result.theme
  const colors = loaded.theme as unknown as Record<string, string>
  const { ink, palette } = createCaptureInterner()

  const frames: CapturedCell[][] = []
  const model =
    loaded.scene === undefined
      ? null
      : compileScene(loaded.scene, colors, ink, SEED)

  // A theme with no animation (parchment) still gets a capture — the
  // renderers use it for the palette swatch, and an empty `frames` is the
  // honest representation of "this one does not move".
  if (model !== null) {
    model.resize(WIDTH, HEIGHT)
    for (let i = 0; i < WARMUP; i++) model.tick()

    const budget = sceneCellBudget(WIDTH, HEIGHT)
    for (let f = 0; f < FRAMES; f++) {
      // cells() returns an array the model reuses between ticks, so this must
      // copy before advancing. Truncating to the pass's budget keeps the
      // capture honest: it shows what a terminal actually paints, not an
      // unbudgeted ideal the real ScenePass would clip.
      const cells = model.cells()
      const take = Math.min(cells.length, budget)
      const frame: CapturedCell[] = new Array(take)
      for (let i = 0; i < take; i++) {
        const c = cells[i]!
        frame[i] = [c.x, c.y, c.char, c.styleId]
      }
      frames.push(frame)
      model.tick()
    }
  }

  const out: SceneCapture = {
    name,
    description: loaded.description ?? '',
    mode: loaded.mode,
    width: WIDTH,
    height: HEIGHT,
    canvas: loaded.mode === 'dark' ? DARK_CANVAS : LIGHT_CANVAS,
    foreground: colors.text ?? (loaded.mode === 'dark' ? '#fff' : '#000'),
    palette,
    frames,
  }

  // sceneLabelOf, not a hand-rolled property read: a custom scene's label is
  // nested one level down (config.scene.label) and an unlabelled scene gets a
  // description synthesised from its layers. This is the same string /theme
  // shows beside the theme name.
  const label = sceneLabelOf(loaded.scene)
  if (label !== null) out.label = label

  return out
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true })

  for (const [name, data] of BUNDLED) {
    const result = capture(name, data)
    const painted = result.frames.reduce((n, f) => n + f.length, 0)
    const avg =
      result.frames.length === 0
        ? 0
        : (painted / result.frames.length).toFixed(1)

    await writeFile(
      join(OUT_DIR, `${name}.json`),
      `${JSON.stringify(result)}\n`,
    )
    console.log(
      `${name.padEnd(10)} ${String(result.frames.length).padStart(3)} frames · ` +
        `${String(result.palette.length).padStart(2)} colours · ${avg} cells/frame`,
    )
  }

  console.log(`\nwrote ${BUNDLED.length} captures to assets/scenes/`)
}

await main()
