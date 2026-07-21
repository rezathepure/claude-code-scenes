import { Box, type Color, type SceneModel, Text } from '@anthropic/ink';
import * as React from 'react';
import { derivePetalStyles, deriveRainStyles } from '../../scene/colors.js';
import { createPetalsModel } from '../../scene/petals.js';
import { createRainModel } from '../../scene/rain.js';
import { mulberry32 } from '../../scene/rng.js';
import type { SceneConfig } from '../../scene/types.js';

/**
 * A miniature live scene inside a picker tile.
 *
 * Reuses the REAL rain/petals models — they are pure and screen-agnostic, as
 * happy at 26×4 as at 200×50 — with a fake style interner: models treat
 * styleIds as opaque numbers, so here a styleId is simply an index into a
 * local array of rgb strings (the same trick the model tests use). No ink
 * screen, no scene pass, no shared state with the full-screen animation that
 * may be running concurrently — hovering matrix in fullscreen shows both, by
 * design.
 */
export function createTileScene(
  sceneConfig: Exclude<SceneConfig, { kind: 'none' }>,
  palette: Record<string, Color>,
  width: number,
  height: number,
  seed: number = Date.now(),
): { model: SceneModel; colors: string[] } {
  const colors: string[] = [];
  const interner = {
    internSceneStyle(color: string): number {
      colors.push(color);
      return colors.length - 1;
    },
  };

  const model =
    sceneConfig.kind === 'rain'
      ? createRainModel(
          sceneConfig.params,
          deriveRainStyles(palette, interner, sceneConfig.params.intensity),
          mulberry32(seed >>> 0),
        )
      : createPetalsModel(
          sceneConfig.params,
          derivePetalStyles(palette, interner, sceneConfig.params.intensity),
          mulberry32(seed >>> 0),
        );
  model.resize(width, height);
  return { model, colors };
}

const TICK_MS = 200; // ~5fps — one small subtree; the eye needs no more

type Props = {
  sceneConfig: Exclude<SceneConfig, { kind: 'none' }>;
  palette: Record<string, Color>;
  width: number;
  height: number;
};

export function TileScene({ sceneConfig, palette, width, height }: Props): React.ReactNode {
  const { model, colors } = React.useMemo(
    () => createTileScene(sceneConfig, palette, width, height),
    [sceneConfig, palette, width, height],
  );
  const [, bump] = React.useReducer((n: number) => n + 1, 0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      model.tick();
      bump();
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [model]);

  // Paint cells into a char/colour grid, then emit per-row runs of
  // same-coloured text. Explicit rgb everywhere — see ThemeTile's hard rules.
  const chars: string[][] = [];
  const cellColors: (string | null)[][] = [];
  for (let y = 0; y < height; y++) {
    chars.push(new Array<string>(width).fill(' '));
    cellColors.push(new Array<string | null>(width).fill(null));
  }
  for (const cell of model.cells()) {
    if (cell.x < 0 || cell.x >= width || cell.y < 0 || cell.y >= height) continue;
    chars[cell.y]![cell.x] = cell.char;
    cellColors[cell.y]![cell.x] = colors[cell.styleId] ?? null;
  }

  return (
    <>
      {chars.map((row, y) => {
        const runs: Array<{ text: string; color: string | null }> = [];
        for (let x = 0; x < width; x++) {
          const color = cellColors[y]![x];
          const char = row[x]!;
          const last = runs[runs.length - 1];
          if (last && last.color === color) {
            last.text += char;
          } else {
            runs.push({ text: char, color });
          }
        }
        return (
          <Box key={y} height={1}>
            <Text wrap="truncate">
              {runs.map((run, i) =>
                run.color === null ? (
                  <Text key={i}>{run.text}</Text>
                ) : (
                  <Text key={i} color={run.color as Color}>
                    {run.text}
                  </Text>
                ),
              )}
            </Text>
          </Box>
        );
      })}
    </>
  );
}
