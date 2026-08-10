#!/usr/bin/env bun
/**
 * A short loop of each starter theme, idling the way you would first see it.
 *
 * Loops rather than stills because these are animations: one instant of sakura
 * or winter reads as almost nothing happening, and the file sizes say the same
 * thing — matrix moves about four times as much as sakura.
 *
 * Writes HTML frames; `scripts/encode-frames.sh` screenshots and encodes them.
 * Run via `bun run capture:starters`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  blankGrid,
  frameHtml,
  H,
  loadTheme,
  paintAnsi,
  paintScene,
  renderChrome,
  renderInput,
  sceneFrames,
} from './lib/terminal-frame.js';
import { STARTER_THEMES } from '../src/themes/bundled/index.js';
import { enableConfigs } from '../src/utils/config.js';

enableConfigs();

const OUT = process.env.FRAMES_DIR ?? join(process.cwd(), '.frames', 'starters');
/** 2.5s at 12fps — long enough to read as motion, short enough to stay small. */
const FRAMES = 30;
/** How far to tick before recording, so each scene is caught mid-life. */
const WARMUP: Record<string, number> = { matrix: 60, sakura: 90, winter: 120 };

for (const [name] of STARTER_THEMES) {
  const loaded = loadTheme(name);
  const chrome = await renderChrome(name);
  const input = await renderInput(name, '', 'Try "how do I log an error?"');
  const scene = sceneFrames(loaded, FRAMES, WARMUP[name] ?? 60);

  const dir = join(OUT, name);
  mkdirSync(dir, { recursive: true });
  scene.forEach((cells, f) => {
    const grid = blankGrid();
    const masked = new Set<string>();
    paintAnsi(grid, masked, chrome, 0, { maskCols: 12 });
    paintAnsi(grid, masked, input, H - 4);
    paintScene(grid, masked, cells);
    writeFileSync(join(dir, `${String(f).padStart(3, '0')}.html`), frameHtml(grid));
  });
  console.log(`  ${name}  ${FRAMES} frames (warmup ${WARMUP[name] ?? 60})`);
}

console.log(`wrote starter frames to ${OUT}`);
