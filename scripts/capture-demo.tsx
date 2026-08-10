#!/usr/bin/env bun
/**
 * The README's hero: one session, start to finish.
 *
 * idle → `/theme` → the grid → describe a vibe → the model designing →
 * the finished theme running. Every frame is the real UI over the real scene
 * engine; the only fiction is that the keystrokes are scripted.
 *
 * winter is deliberately absent from the grid. It is what the prompt goes on
 * to make, and showing it as an existing entry made the demo read as picking a
 * preset rather than creating one.
 *
 * Writes HTML frames; `scripts/encode-frames.sh` screenshots and encodes them.
 * Run via `bun run capture:demo`.
 */

import React from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Box, Text } from '@anthropic/ink';
import { renderToAnsiString } from '../src/utils/staticRender.js';
import { enableConfigs } from '../src/utils/config.js';
import { ThemeTile } from '../src/components/ThemeGrid/ThemeTile.js';
import { CREATE_TILE_VALUE, TILE_WIDTH } from '../src/components/ThemeGrid/layout.js';
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
  themed,
  W,
  type Grid,
  type SceneCell,
} from './lib/terminal-frame.js';

enableConfigs();

const OUT = process.env.FRAMES_DIR ?? join(process.cwd(), '.frames', 'demo');
const PROMPT = 'winter vibe, snowfall and a snowman';

const matrix = loadTheme('matrix');
const winter = loadTheme('winter');

const entry = (name: string, label: string, sceneLabel: string | null) => ({
  value: name,
  paletteName: name,
  label,
  mode: 'dark' as const,
  sceneLabel,
  origin: 'builtin' as const,
});

/** The picker, drawn with the real tile at its real geometry. */
async function gridPanel(): Promise<string> {
  return await renderToAnsiString(
    themed(
      'matrix',
      <Box flexDirection="column" width={W}>
        <ThemeTile
          entry={{ ...entry('create', 'Create your own', null), value: CREATE_TILE_VALUE, special: 'create' } as never}
          focused
          selected={false}
          bannerWidth={TILE_WIDTH * 2 + 1}
        />
        <Box flexDirection="row">
          <ThemeTile entry={entry('matrix', 'matrix', 'rain') as never} focused={false} selected />
          <Text> </Text>
          <ThemeTile entry={entry('sakura', 'sakura', 'petals') as never} focused={false} selected={false} />
        </Box>
      </Box>,
    ),
    W,
  );
}

async function describePanel(typed: string): Promise<string> {
  return await renderToAnsiString(
    themed(
      'matrix',
      <Box flexDirection="column" width={W} borderStyle="round" borderColor="promptBorder" paddingX={1}>
        <Text color="claudeShimmer">{'✦ Design your own theme'}</Text>
        <Text> </Text>
        <Text dimColor>{'  give it a vibe — anything you can picture'}</Text>
        <Text> </Text>
        <Text color="promptBorder">{`  ❯ ${typed}█`}</Text>
      </Box>,
    ),
    W,
  );
}

/** The creator's own wording while the model works. */
const SPIN = ['✻', '✽', '✹', '✽'];
async function designingPanel(i: number): Promise<string> {
  return await renderToAnsiString(
    themed(
      'matrix',
      <Box width={W} paddingX={1}>
        <Text color="claudeShimmer">{`${SPIN[i % SPIN.length]} `}</Text>
        <Text>{`Designing a theme for “${PROMPT}”…`}</Text>
      </Box>,
    ),
    W,
  );
}

const matrixRain = sceneFrames(matrix, 200, 60);
const winterSnow = sceneFrames(winter, 200, 40);
const matrixChrome = await renderChrome('matrix');
const winterChrome = await renderChrome('winter');

const frames: Grid[] = [];
let tick = 0;

function push(opts: { chrome: string; scene: SceneCell[][]; panel?: string; panelTop?: number; input?: string }): void {
  const grid = blankGrid();
  const masked = new Set<string>();
  paintAnsi(grid, masked, opts.chrome, 0, { maskCols: 12 });
  if (opts.panel !== undefined) paintAnsi(grid, masked, opts.panel, opts.panelTop ?? 6, { maskAll: true });
  if (opts.input !== undefined) paintAnsi(grid, masked, opts.input, H - 4);
  paintScene(grid, masked, opts.scene[tick % opts.scene.length]!);
  frames.push(grid);
  tick++;
}

// idle — the layout anyone who has run Claude Code already knows
const idle = await renderInput('matrix', '', 'Try "how do I log an error?"');
for (let i = 0; i < 14; i++) push({ chrome: matrixChrome, scene: matrixRain, input: idle });

// /theme, a character at a time
const CMD = '/theme';
for (let i = 1; i <= CMD.length; i++) {
  const box = await renderInput('matrix', CMD.slice(0, i), '');
  for (let r = 0; r < 2; r++) push({ chrome: matrixChrome, scene: matrixRain, input: box });
}
const full = await renderInput('matrix', CMD, '');
for (let i = 0; i < 6; i++) push({ chrome: matrixChrome, scene: matrixRain, input: full });

// the grid, Create your own focused
const grid = await gridPanel();
for (let i = 0; i < 20; i++) push({ chrome: matrixChrome, scene: matrixRain, panel: grid, panelTop: 5 });

// describing it
for (let i = 1; i <= PROMPT.length; i += 2) {
  push({ chrome: matrixChrome, scene: matrixRain, panel: await describePanel(PROMPT.slice(0, i)), panelTop: 6 });
}
const done = await describePanel(PROMPT);
for (let i = 0; i < 10; i++) push({ chrome: matrixChrome, scene: matrixRain, panel: done, panelTop: 6 });

// the model working — without this beat the theme appears instantly, which is
// the least believable moment in the whole sequence
for (let i = 0; i < 22; i++) {
  push({ chrome: matrixChrome, scene: matrixRain, panel: await designingPanel(i), panelTop: 10 });
}

// the result
const winterIdle = await renderInput('winter', '', 'Try "how do I log an error?"');
for (let i = 0; i < 34; i++) push({ chrome: winterChrome, scene: winterSnow, input: winterIdle });

mkdirSync(OUT, { recursive: true });
frames.forEach((g, i) => writeFileSync(join(OUT, `${String(i).padStart(4, '0')}.html`), frameHtml(g)));
console.log(`wrote ${frames.length} demo frames to ${OUT}`);
