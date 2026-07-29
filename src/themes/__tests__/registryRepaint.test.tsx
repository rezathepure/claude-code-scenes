/**
 * Re-registering the theme you are currently using has to repaint.
 *
 * `registerTheme` notifies the registry and `ThemeProvider` subscribes to it,
 * which reads like it is enough — `src/themes/watcher.ts` says so in a comment.
 * It was not. The provider builds its context value with
 * `useMemo(..., [themeSetting, previewTheme, currentTheme, onThemeSave])`; a
 * registry mutation changes none of those, so the memo returned the same object
 * with the same children and React bailed out of the whole subtree.
 *
 * The name is the same in both cases that matter — editing a theme file while
 * it is active, and refining a draft in `/theme create` — so nothing repainted
 * until restart. This test is the difference between those features working and
 * silently doing nothing.
 */

import { describe, expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import { Text, ThemeProvider, useTheme, wrappedRender } from '@anthropic/ink';
import * as React from 'react';
import { getTheme, registerTheme, unregisterTheme } from '../../utils/theme.js';

const NAME = 'test-only-repaint';

/** Prints the live value of one slot, resolved the way real components do. */
function Probe(): React.ReactNode {
  const [current] = useTheme();
  return <Text>{`[${getTheme(current).claude}]`}</Text>;
}

/** Everything ink wrote, across every frame — not just the first. */
async function renderFrames(node: React.ReactNode, mutate: () => void): Promise<string> {
  const stream = new PassThrough();
  let output = '';
  stream.on('data', chunk => {
    output += chunk.toString();
  });

  const instance = await wrappedRender(node, {
    stdout: stream as unknown as NodeJS.WriteStream,
    patchConsole: false,
  });
  // Let the first frame land before changing anything underneath it.
  await new Promise(resolve => setTimeout(resolve, 20));
  mutate();
  await new Promise(resolve => setTimeout(resolve, 20));
  instance.unmount();
  return output;
}

describe('theme registry repaint', () => {
  test('a same-name re-registration reaches the rendered output', async () => {
    registerTheme(NAME, { ...getTheme('dark'), claude: 'rgb(1,2,3)' });
    try {
      const output = await renderFrames(
        <ThemeProvider initialState={NAME}>
          <Probe />
        </ThemeProvider>,
        () => registerTheme(NAME, { ...getTheme('dark'), claude: 'rgb(9,8,7)' }),
      );

      expect(output).toContain('[rgb(1,2,3)]');
      expect(output).toContain('[rgb(9,8,7)]');
    } finally {
      unregisterTheme(NAME);
    }
  });
});
