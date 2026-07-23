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
/**
 * Ring colours are chrome and deliberately FIXED, not taken from the tile's
 * palette. Every tile paints in its own colours, so a palette-derived focus
 * ring changed hue on every keypress — green on matrix, pink on sakura — and
 * read as noise rather than "you are here". One colour, everywhere, always.
 */
const FOCUS_PULSE = [
  'rgb(168,90,64)', // dim Claude Orange
  'rgb(215,119,87)', // Claude Orange #D77757
  'rgb(255,168,130)', // bright
  'rgb(215,119,87)',
] as const;
const FOCUS_PULSE_MS = 350;
/** Fixed green for the current theme's ring and checkmark, readable in both modes. */
const SELECTED_COLOR = 'rgb(46,160,67)';
/**
 * Fixed neutral for every resting tile. Taking this from the tile's palette
 * (t.subtle) gave each tile its own border colour — near-white on the ANSI
 * themes, amber on yellowish — and the one ring that MEANS something (the
 * selected green) disappeared in the crowd. Quiet on dark, visible on the
 * light-tile fill.
 */
const RESTING_BORDER = 'rgb(96,96,96)';

/**
 * Pulses the focus ring through the orange shades while active. Raw
 * setInterval like TileScene: the shared-clock useInterval is non-keepAlive,
 * and the picker idles with no spinner driving that clock.
 */
function useFocusPulse(active: boolean): string {
  const [frame, setFrame] = React.useState(1);
  React.useEffect(() => {
    if (!active) return;
    setFrame(1);
    const timer = setInterval(() => setFrame(f => (f + 1) % FOCUS_PULSE.length), FOCUS_PULSE_MS);
    return () => clearInterval(timer);
  }, [active]);
  return FOCUS_PULSE[frame] ?? FOCUS_PULSE[1];
}

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
  const focusRing = useFocusPulse(focused);
  const sceneConfig = getSceneConfig(entry.paletteName);
  const scene = sceneConfig.kind === 'none' ? null : sceneConfig;

  return (
    <Box
      width={TILE_WIDTH}
      height={7}
      flexDirection="column"
      flexShrink={0}
      borderStyle={focused ? 'double' : 'round'}
      borderColor={(focused ? focusRing : selected ? SELECTED_COLOR : RESTING_BORDER) as Color}
      backgroundColor={entry.mode === 'light' ? 'rgb(245,245,245)' : undefined}
      paddingX={0}
    >
      <Box height={1}>
        <Text wrap="truncate-end">
          <Text color={t.claude} bold={focused}>
            ●{' '}
          </Text>
          {selected && (
            <Text color={SELECTED_COLOR as Color} bold>
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
            {selected && <Text color={SELECTED_COLOR as Color}> · current</Text>}
          </Box>
        </>
      )}
    </Box>
  );
}

export const ThemeTile = React.memo(ThemeTileInner);
