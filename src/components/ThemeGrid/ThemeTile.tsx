import { Box, type Color, Text } from '@anthropic/ink';
import * as React from 'react';
import { getSceneConfig } from '../../scene/registry.js';
import { getTheme } from '../../utils/theme.js';
import type { GridEntry } from './layout.js';
import { TILE_INNER_WIDTH, TILE_WIDTH } from './layout.js';
import { TileScene } from './TileScene.js';

/**
 * One theme preview tile, painted in ITS OWN palette while the app renders in
 * the current one.
 *
 * HARD RULES for everything inside a tile (verified against ThemedText /
 * ThemedBox resolution):
 *  - every colour is an explicit `rgb(...)` string from this tile's palette —
 *    raw values pass the resolver's prefix sniff, theme KEYS would resolve
 *    against the CURRENT theme and leak it into the tile;
 *  - never `<Text backgroundColor>` — that prop is theme-key-typed only;
 *  - never `dimColor` — it maps to the CURRENT theme's `inactive`.
 */
function ThemeTileInner({
  entry,
  focused,
  selected,
}: {
  entry: GridEntry;
  focused: boolean;
  selected: boolean;
}): React.ReactNode {
  // Double assertion per house style: palette values are rgb() strings, which
  // satisfy Color at runtime via the resolver's raw-value passthrough.
  const t = getTheme(entry.paletteName) as unknown as Record<string, Color>;
  const sceneConfig = getSceneConfig(entry.paletteName);
  const scene = sceneConfig.kind === 'none' ? null : sceneConfig;

  return (
    <Box
      width={TILE_WIDTH}
      height={7}
      flexDirection="column"
      flexShrink={0}
      borderStyle={focused ? 'double' : 'round'}
      borderColor={focused ? t.claude : selected ? t.success : t.subtle}
      backgroundColor={entry.mode === 'light' ? 'rgb(245,245,245)' : undefined}
      paddingX={0}
    >
      <Box height={1}>
        <Text wrap="truncate-end">
          <Text color={t.claude} bold={focused}>
            ●{' '}
          </Text>
          {selected && (
            <Text color={t.success} bold>
              ✓{' '}
            </Text>
          )}
          <Text color={t.claude} bold={focused}>
            {entry.label}
          </Text>
          {entry.sceneKind !== 'none' && <Text color={t.claudeShimmer}> ✦ {entry.sceneKind}</Text>}
        </Text>
      </Box>
      {focused && scene !== null ? (
        <TileScene sceneConfig={scene} palette={t} width={TILE_INNER_WIDTH} height={4} />
      ) : (
        <>
          <Box height={1}>
            <Text wrap="truncate-end">
              <Text color={t.claude}>❯ </Text>
              <Text color={t.text}>Read </Text>
              <Text color={t.permission}>src/app.ts</Text>
            </Text>
          </Box>
          <Box height={1}>
            <Text wrap="truncate-end">
              <Text color={t.diffAddedWord}>+ resolved()</Text>
              <Text color={t.diffRemovedWord}> - legacy()</Text>
            </Text>
          </Box>
          <Box height={1}>
            <Text wrap="truncate-end">
              <Text color={t.success}>● </Text>
              <Text color={t.warning}>● </Text>
              <Text color={t.error}>● </Text>
              <Text color={t.inactive}>12k tokens</Text>
            </Text>
          </Box>
          <Box height={1}>
            <Text color={t.inactive}>{entry.mode}</Text>
            {selected && <Text color={t.success}> · current</Text>}
          </Box>
        </>
      )}
    </Box>
  );
}

export const ThemeTile = React.memo(ThemeTileInner);
