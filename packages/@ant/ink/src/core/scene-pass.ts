/**
 * ScenePass — paints an animated background "scene" (theme-declared rain,
 * petals, …) into cells the React tree left empty.
 *
 * Runs as a fourth post-render pass inside Ink.onRender(), the same shape as
 * the selection/search overlays: after the renderer has produced the frame's
 * screen, before the diff. It never touches a cell the UI painted — glyphs
 * appear only where both packed words are zero — so it cannot corrupt real
 * content, and its glyphs are marked noSelect so they never appear in copied
 * text or get inverted by a selection.
 *
 * ## Why ownership is by styleId, not by coordinates
 *
 * The renderer's blit fast path copies a clean node's FULL rect from the
 * previous frame — including cells the node's content left empty. Scene
 * glyphs painted last frame therefore get resurrected into the new frame.
 * Worse, the ScrollBox scroll fast path *relocates* blitted cells (shiftRows),
 * so a coordinate list of "cells I painted" goes stale the moment the user
 * scrolls: the resurrected glyph lands at coordinates the list has never
 * heard of and survives forever.
 *
 * Instead, scene styles are interned with SCENE_STYLE_MARKER appended — an
 * AnsiCode with empty open/close codes. StylePool.intern keys on
 * `styles.map(s => s.code).join('\0')`, so `[fg]` keys as `"X"` while
 * `[fg, MARKER]` keys as `"X\0"`: a distinct pool entry with byte-identical
 * terminal output. No other code path interns an empty code, so a scene
 * styleId can never collide with real text — even text drawn in the exact
 * same colour, which matters because scene colours are derived from the
 * theme palette. StylePool ids are never evicted or renumbered (they are
 * array indices), so the flag set below can never go stale.
 *
 * Each apply() then simply sweeps the whole buffer erasing every cell whose
 * styleId is flagged, wherever blit or scroll may have moved it, and repaints
 * the model's current cells. One linear pass over an Int32Array — tens of
 * microseconds — and blit stays enabled, which the A0 measurements showed is
 * what keeps a tick at ~1ms on a 2800-row transcript versus ~2.5ms with
 * blit disabled.
 */

import type { AnsiCode } from '@alcalzone/ansi-tokenize'
import { CellWidth, isEmptyCellAt, type Screen, setCellAt } from './screen.js'

/**
 * Appended to every scene style before interning. Contributes nothing to the
 * emitted SGR stream; exists purely to make the interned styleId unique to
 * the scene. See the module doc for why this is load-bearing.
 */
export const SCENE_STYLE_MARKER: AnsiCode = {
  type: 'ansi',
  code: '',
  endCode: '',
}

/** One glyph the scene wants on screen this frame. */
export type SceneGlyph = {
  x: number
  y: number
  /** Single grapheme, width 1. Wide characters are the model's bug, not ours. */
  char: string
  /** A styleId previously registered via markSceneStyle. */
  styleId: number
}

/**
 * A scene animation. Implemented by the application (rain, petals, …); the
 * pass itself knows nothing about what is being drawn.
 */
export interface SceneModel {
  /**
   * Called by ScenePass whenever the screen dimensions change, including
   * before the first paint. Implementations reset their state to fit.
   */
  resize(width: number, height: number): void
  /**
   * Advance one animation step. Called ONLY by the application's ticker —
   * never from inside a render — so React-triggered renders between ticks
   * repaint the identical frame and typing does not speed the animation up.
   */
  tick(): void
  /**
   * The cells to paint this frame. Must be stable between tick() calls
   * (cache the array). Order is paint priority: when the per-frame budget
   * truncates, the tail is dropped.
   */
  cells(): ReadonlyArray<SceneGlyph>
}

/**
 * Hard cap on painted cells per frame, keeping SSH/tmux byte volume bounded.
 *
 * Exported because the application composites several scene layers into the
 * single array this pass truncates, and it can only divide a budget it can
 * see. Two copies of these numbers would drift the moment either changed.
 */
export const MAX_CELLS_ABSOLUTE = 600
/** …and never more than this fraction of the screen. */
export const MAX_CELLS_FRACTION = 0.15

/** The pass's per-frame paint budget for a screen of the given size. */
export function sceneCellBudget(width: number, height: number): number {
  return Math.min(MAX_CELLS_ABSOLUTE, (width * height * MAX_CELLS_FRACTION) | 0)
}

const EMPTY_CELL = {
  char: ' ',
  styleId: 0, // caller passes screen.emptyStyleId; kept here for clarity only
  width: CellWidth.Narrow,
  hyperlink: undefined,
}

export class ScenePass {
  private model: SceneModel | null = null
  /** flags[styleId >>> 1] === 1 marks a scene-owned style. Grows by doubling. */
  private flags = new Uint8Array(256)
  private lastWidth = -1
  private lastHeight = -1
  private paintedLastFrame = 0

  /**
   * Swap the animation (or remove it with null). The next apply() erases
   * whatever the previous model left behind before painting the new one, so
   * switching themes needs no other cleanup.
   */
  setModel(model: SceneModel | null): void {
    this.model = model
    // Force a resize callback on the next apply so a new model always
    // learns the dimensions before its first cells() is consumed.
    this.lastWidth = -1
    this.lastHeight = -1
  }

  /** Register a styleId (from StylePool.intern with SCENE_STYLE_MARKER). */
  markSceneStyle(styleId: number): void {
    const index = styleId >>> 1
    if (index >= this.flags.length) {
      let next = this.flags.length * 2
      while (next <= index) next *= 2
      const grown = new Uint8Array(next)
      grown.set(this.flags)
      this.flags = grown
    }
    this.flags[index] = 1
  }

  /**
   * True while there is anything to do: a live model, or leftover glyphs
   * from a removed one that still need a final erasing sweep.
   */
  get active(): boolean {
    return this.model !== null || this.paintedLastFrame > 0
  }

  /**
   * The pass itself. Call after the renderer produced `screen`, before the
   * diff. Erases every scene-styled cell (wherever blit or scroll moved it),
   * then paints the model's current cells into cells that are empty now.
   */
  apply(screen: Screen): void {
    const width = screen.width
    const height = screen.height

    if (width !== this.lastWidth || height !== this.lastHeight) {
      this.lastWidth = width
      this.lastHeight = height
      this.model?.resize(width, height)
    }

    // 1. Sweep: erase our own glyphs from the previous frame. Skipped when
    // the previous frame painted nothing — the screen is provably scene-free.
    if (this.paintedLastFrame > 0) {
      const total = width * height
      const cells = screen.cells
      const flags = this.flags
      for (let idx = 0; idx < total; idx++) {
        const word1 = cells[(idx << 1) | 1]!
        if (word1 !== 0 && flags[(word1 >>> 17) >>> 1] === 1) {
          setCellAt(screen, idx % width, (idx / width) | 0, {
            ...EMPTY_CELL,
            styleId: screen.emptyStyleId,
          })
          screen.noSelect[idx] = 0
        }
      }
    }

    // 2. Paint the current frame's cells, empty cells only, budget-capped.
    let painted = 0
    if (this.model !== null) {
      const budget = Math.min(
        MAX_CELLS_ABSOLUTE,
        (width * height * MAX_CELLS_FRACTION) | 0,
      )
      const glyphs = this.model.cells()
      for (let i = 0; i < glyphs.length && painted < budget; i++) {
        const glyph = glyphs[i]!
        const x = glyph.x
        const y = glyph.y
        if (x < 0 || y < 0 || x >= width || y >= height) continue
        if (!isEmptyCellAt(screen, x, y)) continue
        setCellAt(screen, x, y, {
          char: glyph.char,
          styleId: glyph.styleId,
          width: CellWidth.Narrow,
          hyperlink: undefined,
        })
        screen.noSelect[y * width + x] = 1
        painted++
      }
    }

    this.paintedLastFrame = painted
  }
}
