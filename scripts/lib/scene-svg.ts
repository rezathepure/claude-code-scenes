/**
 * Renders a scene capture to SVG — the shared encoder behind both output
 * formats.
 *
 * SVG rather than pixels because the frames are text: the animation is glyphs
 * on a grid, so the natural encoding is <text>, and glyph coverage becomes
 * the renderer's problem rather than ours. That matters here — the scenes use
 * halfwidth katakana, dingbats and box-drawing, and a rasteriser missing any
 * of those draws tofu without complaining.
 *
 * Two outputs, one encoder:
 *
 *  - `renderAnimatedSvg` — every frame in one file, cycled with CSS `steps()`.
 *    No JavaScript, so it survives being loaded through <img> or inlined.
 *    This is the landing-page asset.
 *  - `renderFrameSvg` — a single frame, static. librsvg (and therefore sharp)
 *    ignores CSS animation entirely and would render the animated file as a
 *    blank rectangle, so the GIF path rasterises these one at a time instead.
 */

import type { SceneCapture } from '../capture-scene.ts'

/**
 * Cell metrics in px. Whole numbers on purpose: every glyph's position is
 * written into the file, so fractional metrics would add two decimals to tens
 * of thousands of coordinates for no visible gain. 9x19 is close to the aspect
 * a terminal monospace renders 15px text at, so the grid is not stretched
 * relative to what was captured.
 */
export const CELL_W = 9
export const CELL_H = 19
const FONT_SIZE = 15
/** Distance from the cell's top edge to the text baseline. */
const BASELINE = 14

/** Seconds per frame — ~12fps, the rate the scene ticker runs at. */
export const FRAME_DURATION = 1 / 12

/**
 * Ordered widest-coverage-first. The scenes reach well outside ASCII, and the
 * generic `monospace` at the end is what actually resolves katakana on most
 * systems, so it is a real entry rather than politeness.
 */
const FONT_STACK =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "DejaVu Sans Mono", "Noto Sans Mono CJK JP", monospace'

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ESCAPES[c]!)
}

export function pixelWidth(capture: SceneCapture): number {
  return capture.width * CELL_W
}

export function pixelHeight(capture: SceneCapture): number {
  return capture.height * CELL_H
}

/**
 * One frame's glyphs, grouped by colour into a single <text> each.
 *
 * SVG's `x` and `y` accept lists, placing the nth character at the nth
 * coordinate pair. That turns matrix's ~200 elements per frame into 7 and
 * cuts the animated file by roughly 4x — the difference between an asset a
 * page can carry and one it cannot.
 */
function frameBody(capture: SceneCapture, index: number): string {
  const frame = capture.frames[index]
  if (frame === undefined) return ''

  const byColour = new Map<
    number,
    { xs: number[]; ys: number[]; chars: string[] }
  >()
  for (const [x, y, char, styleId] of frame) {
    let bucket = byColour.get(styleId)
    if (bucket === undefined) {
      bucket = { xs: [], ys: [], chars: [] }
      byColour.set(styleId, bucket)
    }
    bucket.xs.push(x * CELL_W)
    bucket.ys.push(y * CELL_H + BASELINE)
    bucket.chars.push(char)
  }

  return [...byColour.entries()]
    .map(
      ([styleId, b]) =>
        `<text fill="${capture.palette[styleId] ?? 'currentColor'}" x="${b.xs.join(' ')}" y="${b.ys.join(' ')}">${esc(b.chars.join(''))}</text>`,
    )
    .join('')
}

function open(capture: SceneCapture, extraStyle: string): string {
  const w = pixelWidth(capture)
  const h = pixelHeight(capture)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(capture.name)} — animated terminal theme">
<title>${esc(capture.name)}${capture.label === undefined ? '' : ` — ${esc(capture.label)}`}</title>
<style>text{font-family:${FONT_STACK};font-size:${FONT_SIZE}px;white-space:pre}${extraStyle}</style>
<rect width="100%" height="100%" fill="${capture.canvas}"/>`
}

/** A single frame, static — what the GIF path rasterises. */
export function renderFrameSvg(capture: SceneCapture, index: number): string {
  return `${open(capture, '')}${frameBody(capture, index)}</svg>\n`
}

/** Every frame in one file, cycled with CSS. The landing-page asset. */
export function renderAnimatedSvg(capture: SceneCapture): string {
  const total = capture.frames.length
  if (total === 0) return `${open(capture, '')}</svg>\n`

  // Each frame owns one slot of the cycle. `steps(1)` gives a hard cut rather
  // than a cross-fade, which is what a terminal repaint actually looks like.
  const slot = (100 / total).toFixed(4)
  const style =
    `.f{opacity:0;animation:flip ${(total * FRAME_DURATION).toFixed(3)}s steps(1) infinite}` +
    `@keyframes flip{0%,${slot}%{opacity:1}${slot}%,100%{opacity:0}}` +
    // Honour the OS setting: a full-screen field of falling glyphs is exactly
    // the kind of motion this preference exists to stop.
    `@media(prefers-reduced-motion:reduce){.f{animation:none}.f:first-of-type{opacity:1}}`

  const frames: string[] = []
  for (let i = 0; i < total; i++) {
    frames.push(
      `<g class="f" style="animation-delay:${(i * FRAME_DURATION).toFixed(3)}s">${frameBody(capture, i)}</g>`,
    )
  }

  return `${open(capture, style)}\n${frames.join('\n')}\n</svg>\n`
}
