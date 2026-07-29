import { Box, type Color, Text } from '@anthropic/ink';
import * as React from 'react';
import { TileScene } from '../../components/ThemeGrid/TileScene.js';
import { describeScene } from '../../scene/label.js';
import type { SceneConfig } from '../../scene/types.js';
import { getTheme } from '../../utils/theme.js';

/**
 * The animation, at panel size, while you tune it.
 *
 * The full-screen backdrop only runs in alt-screen, which most people are not
 * in — so for them this box is the only place the animation is ever visible.
 * It goes through TileScene, which runs the real compiler with a fake style
 * interner, rather than a simplified renderer: what you see here is what the
 * theme is.
 *
 * The prose underneath is not a caption, it is the other half of the preview.
 * A sparse scene genuinely renders three or four characters in a box this
 * size — sakura peaks at five cells in seventy columns — and watching that
 * tells you nothing about what to change. `describeScene` names the motions,
 * catalogs and slots, which are the words a refinement is made of.
 *
 * Density is NOT inflated to make the box livelier. It would flatter the
 * theme and then betray it the moment the theme was actually used.
 */
export function BackdropPreview({
  themeName,
  scene,
  width,
  height,
  fullscreen,
}: {
  themeName: string;
  scene: SceneConfig | undefined;
  width: number;
  /** Rows for the animation box itself, before the prose. */
  height: number;
  /** Whether the real backdrop is running behind the app right now. */
  fullscreen: boolean;
}): React.ReactNode {
  // Raw values from this theme's palette, as TileScene expects.
  const palette = getTheme(themeName) as unknown as Record<string, Color>;
  const lines = describeScene(scene);

  if (scene === undefined || scene.kind === 'none') {
    return (
      <Box flexDirection="column">
        <Text dimColor>This theme is still — no animation.</Text>
        <Text dimColor italic>
          Ask for one: “add slow drifting embers”, “rain, but sparse”.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box width={width} height={height} overflow="hidden" flexShrink={0}>
        <TileScene sceneConfig={scene} palette={palette} width={width} height={height} />
      </Box>
      {lines.map(line => (
        <Text key={line} dimColor wrap="truncate-end">
          {line}
        </Text>
      ))}
      <Text dimColor italic>
        {fullscreen
          ? `Preview at ${width}×${height} — it is also running full-screen behind this panel.`
          : `Preview at ${width}×${height} — full-screen needs CLAUDE_CODE_NO_FLICKER=1.`}
      </Text>
    </Box>
  );
}
