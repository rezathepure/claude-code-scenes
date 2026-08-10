/**
 * Renders the real TUI to still frames, offline.
 *
 * The marketing assets are not mock-ups: the chrome comes from the same Ink
 * components the REPL mounts, and the backdrop from the same scene engine that
 * paints during a session. This module is the part they share — render a
 * component to ANSI, parse that into a cell grid, composite it over scene
 * cells, and emit HTML that a headless browser can screenshot.
 *
 * HTML rather than SVG because the assets have to look like a terminal, and a
 * terminal is more than glyphs: the window padding, the background gradient,
 * the corner radius. `<img>`-embedded SVG can carry none of that, and the first
 * attempt at this produced white-on-black text with no window at all.
 *
 * Callers MUST run under `scripts/render-with-defines.ts` (MACRO/feature
 * defines) with FORCE_COLOR=3 — without the latter, Ink emits no escape codes
 * at all off a TTY and every glyph comes out the default foreground.
 */

import React from 'react';
import { Box, Text, ThemeProvider, sceneCellBudget, setThemeConfigCallbacks } from '@anthropic/ink';
import { renderToAnsiString } from '../../src/utils/staticRender.js';
import { LogoV2 } from '../../src/components/LogoV2/LogoV2.js';
import { AppStateProvider } from '../../src/state/AppState.js';
import { getDefaultAppState } from '../../src/state/AppStateStore.js';
import { compileScene } from '../../src/scene/compile.js';
import { loadThemeFromText } from '../../src/themes/loader.js';
import { registerThemeWithTraits } from '../../src/themes/register.js';
import { STARTER_THEMES } from '../../src/themes/bundled/index.js';

/** 100x22 at 9x19px is 900x418 — a terminal's proportions, and it fits a README. */
export const W = 100;
export const H = 22;
/** Fixed so a re-render of the same asset is byte-identical. */
export const SEED = 7;
/** Never the directory this happens to run in. */
export const CWD = '~/projects/demo';

const ESC = String.fromCharCode(27);
const DEFAULT_FG = 'rgb(230,237,243)';

export type Cell = { ch: string; fg: string; bg: string | null; bold: boolean };
export type Grid = (Cell | null)[][];
export type SceneCell = { x: number; y: number; ch: string; fg: string };

export function blankGrid(): Grid {
  return Array.from({ length: H }, () => Array<Cell | null>(W).fill(null));
}

export function loadTheme(name: string) {
  const data = STARTER_THEMES.find(([n]) => n === name)?.[1];
  if (data === undefined) throw new Error(`no starter theme "${name}"`);
  const loaded = loadThemeFromText(name, JSON.stringify(data)).theme;
  if (loaded === null) throw new Error(`theme "${name}" failed to load`);
  registerThemeWithTraits(name, loaded.theme as never, loaded.mode, loaded.scene);
  return loaded;
}

/**
 * Paints one component's ANSI output into the grid.
 *
 * `maskCols` / `maskAll` record cells the UI owns even where it drew a space,
 * so the scene does not show through a logo or a panel the way it never would
 * in a real session.
 */
export function paintAnsi(
  grid: Grid,
  masked: Set<string>,
  ansi: string,
  top: number,
  opts: { maskCols?: number; maskAll?: boolean } = {},
): void {
  let fg = DEFAULT_FG;
  let bg: string | null = null;
  let bold = false;
  ansi.split('\n').forEach((line, i) => {
    const y = top + i;
    let x = 0;
    for (let k = 0; k < line.length; k++) {
      if (line[k] === ESC && line[k + 1] === '[') {
        const end = line.indexOf('m', k);
        if (end === -1) break;
        const p = line
          .slice(k + 2, end)
          .split(';')
          .map(Number);
        for (let j = 0; j < p.length; j++) {
          const c = p[j];
          if (c === 0) {
            fg = DEFAULT_FG;
            bg = null;
            bold = false;
          } else if (c === 1) bold = true;
          else if (c === 2 || c === 22) bold = false;
          else if (c === 39) fg = DEFAULT_FG;
          else if (c === 49) bg = null;
          else if (c === 38 && p[j + 1] === 2) {
            fg = `rgb(${p[j + 2]},${p[j + 3]},${p[j + 4]})`;
            j += 4;
          } else if (c === 48 && p[j + 1] === 2) {
            bg = `rgb(${p[j + 2]},${p[j + 3]},${p[j + 4]})`;
            j += 4;
          }
        }
        k = end;
        continue;
      }
      const ch = line[k] ?? ' ';
      if (y >= 0 && y < H && x < W) {
        if (ch !== ' ' || bg !== null) grid[y]![x] = { ch, fg, bg, bold };
        if (opts.maskAll === true) masked.add(`${x},${y}`);
        else if (opts.maskCols !== undefined && x < opts.maskCols) masked.add(`${x},${y}`);
      }
      x++;
    }
  });
}

/** Scene cells fill whatever the UI left empty. */
export function paintScene(grid: Grid, masked: Set<string>, cells: SceneCell[]): void {
  for (const c of cells) {
    if (c.y < H && c.x < W && grid[c.y]![c.x] === null && !masked.has(`${c.x},${c.y}`)) {
      grid[c.y]![c.x] = { ch: c.ch, fg: c.fg, bg: null, bold: false };
    }
  }
}

/** Ticks a theme's scene and returns each frame's cells. */
export function sceneFrames(loaded: ReturnType<typeof loadTheme>, count: number, warmup: number): SceneCell[][] {
  const seen = new Map<string, number>();
  const palette: string[] = [];
  const ink = {
    internSceneStyle(colour: string): number {
      const hit = seen.get(colour);
      if (hit !== undefined) return hit;
      const id = palette.length;
      palette.push(colour);
      seen.set(colour, id);
      return id;
    },
  };
  const model = compileScene(loaded.scene!, loaded.theme as never, ink, SEED);
  model.resize(W, H);
  for (let i = 0; i < warmup; i++) model.tick();

  const budget = sceneCellBudget(W, H);
  const out: SceneCell[][] = [];
  for (let f = 0; f < count; f++) {
    out.push(
      model
        .cells()
        .slice(0, budget)
        .map(c => ({ x: c.x, y: c.y, ch: c.char, fg: palette[c.styleId] ?? '#0f0' })),
    );
    model.tick();
  }
  return out;
}

/** Every render must sit inside a theme provider, or Ink falls back to `dark`. */
export function themed(name: string, node: React.ReactNode): React.ReactNode {
  return (
    <ThemeProvider initialState={name as never} onThemeSave={() => {}}>
      {node}
    </ThemeProvider>
  );
}

/**
 * The header: mascot, version, model, cwd, notice.
 *
 * The notice line rotates at random, so it is re-rendered until the stable one
 * comes up — otherwise consecutive frames would flicker between two messages.
 */
export async function renderChrome(name: string): Promise<string> {
  setThemeConfigCallbacks({ loadTheme: () => name as never, saveTheme: () => {} });
  const node = themed(
    name,
    <AppStateProvider initialState={getDefaultAppState()} onChangeAppState={() => {}}>
      <LogoV2 />
    </AppStateProvider>,
  );
  let out = '';
  for (let i = 0; i < 25; i++) {
    out = await renderToAnsiString(node, W);
    if (out.includes('Opus now defaults')) break;
  }
  return out.replace(/~\/[^\s]*/, CWD);
}

/**
 * The prompt box and status row.
 *
 * Composed from the same Ink primitives and theme tokens the REPL uses rather
 * than from PromptInput, which takes 66 props of live REPL state and
 * contributes no pixels of its own to a still frame.
 */
export async function renderInput(name: string, typed: string, placeholder: string): Promise<string> {
  return await renderToAnsiString(
    themed(
      name,
      <Box flexDirection="column" width={W}>
        <Box borderStyle="round" borderColor="promptBorder" paddingX={1}>
          <Text color="promptBorder">{'> '}</Text>
          {typed ? <Text>{typed}</Text> : <Text dimColor>{placeholder}</Text>}
        </Box>
        <Box>
          <Text color="autoAccept">{'  ▶▶ '}</Text>
          <Text dimColor>accept edits on (shift+tab to cycle)</Text>
        </Box>
      </Box>,
    ),
    W,
  );
}

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * One frame as a standalone page.
 *
 * Backgrounds are clipped to a 16px band because a terminal paints block
 * glyphs edge-to-edge in the cell while a browser fills only the em box —
 * without the clip, the mascot's eyes halo.
 */
export function frameHtml(grid: Grid): string {
  const body = grid
    .map(row => {
      let out = '';
      let run = '';
      let cur: string | null = null;
      const flush = (): void => {
        if (run !== '') {
          out += cur !== null ? `<i style="${cur}">${escapeHtml(run)}</i>` : escapeHtml(run);
          run = '';
        }
      };
      for (const cell of row) {
        const key =
          cell !== null
            ? `color:${cell.fg}${cell.bg !== null ? `;background-image:linear-gradient(${cell.bg},${cell.bg});background-size:100% 16px;background-position:0 3px;background-repeat:no-repeat` : ''}${cell.bold ? ';font-weight:700' : ''}`
            : null;
        if (key !== cur) {
          flush();
          cur = key;
        }
        run += cell !== null ? cell.ch : ' ';
      }
      flush();
      return out;
    })
    .join('\n');

  return `<!doctype html><meta charset="utf-8"><style>
*{margin:0;padding:0}
html,body{background:#0d1117}
body{display:flex;justify-content:center;align-items:center;height:470px}
.term{background:#1c222c;background-image:radial-gradient(120% 100% at 25% 20%,#232b38 0%,#191e27 60%,#141922 100%);
 padding:26px 30px;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
pre{font:15px/19px Menlo,Monaco,'Apple Symbols','Segoe UI Symbol',monospace;color:${DEFAULT_FG};white-space:pre}
i{font-style:normal}
</style><div class="term"><pre>${body}</pre></div>`;
}
