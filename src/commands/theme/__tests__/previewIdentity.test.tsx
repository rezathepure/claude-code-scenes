/**
 * Why ThemeCreator reads the preview API through a ref.
 *
 * ThemeProvider builds its context value with `useMemo(..., [previewTheme,
 * …])`, so `setPreviewTheme` is a fresh closure after every preview change.
 * An effect that both depends on it and calls it therefore re-runs itself —
 * which is what made `/theme create` spend a second design call on every
 * attempt: the generation effect previewed its own result, was torn down, and
 * generated again.
 *
 * This is a contract we rely on rather than one we own, so it is pinned here
 * instead of being left to a comment. If ThemeProvider ever hands out stable
 * callbacks, this test says so and the ref in ThemeCreator can go.
 */

import { describe, expect, test } from 'bun:test';
import { Text, ThemeProvider, usePreviewTheme } from '@anthropic/ink';
import * as React from 'react';
import { renderToString } from '../../../utils/staticRender.js';

type Counter = { runs: number };

/** The shape that bites: setPreviewTheme in the deps AND in the body. */
function DependsOnIt({ count }: { count: Counter }): React.ReactNode {
  const { setPreviewTheme } = usePreviewTheme();
  React.useEffect(() => {
    count.runs++;
    setPreviewTheme('light');
  }, [setPreviewTheme, count]);
  return <Text>probe</Text>;
}

/** ThemeCreator's shape: the callback is read from a ref, not depended on. */
function ReadsItFromARef({ count }: { count: Counter }): React.ReactNode {
  const { setPreviewTheme } = usePreviewTheme();
  const ref = React.useRef(setPreviewTheme);
  ref.current = setPreviewTheme;
  React.useEffect(() => {
    count.runs++;
    ref.current('light');
  }, [count]);
  return <Text>probe</Text>;
}

async function countRuns(node: (count: Counter) => React.ReactNode): Promise<number> {
  const count: Counter = { runs: 0 };
  await renderToString(<ThemeProvider initialState="dark">{node(count)}</ThemeProvider>, 40);
  return count.runs;
}

describe('usePreviewTheme identity', () => {
  test('an effect that depends on setPreviewTheme and calls it runs twice', async () => {
    expect(await countRuns(count => <DependsOnIt count={count} />)).toBe(2);
  });

  test('reading it from a ref runs the effect once', async () => {
    expect(await countRuns(count => <ReadsItFromARef count={count} />)).toBe(1);
  });
});
