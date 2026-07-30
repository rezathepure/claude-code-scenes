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
import { getTheme, registerTheme, unregisterTheme } from '../../../utils/theme.js';

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

const REGISTERED_NAME = 'test-only-preview-identity';

/**
 * Registers a theme from inside the very effect that depends on the preview
 * API. The `done` guard is the point: without it this loops forever, which is
 * precisely the failure the ref in ThemeCreator exists to prevent.
 */
function RegistersOnce({ count }: { count: Counter }): React.ReactNode {
  const { setPreviewTheme } = usePreviewTheme();
  const done = React.useRef(false);
  React.useEffect(() => {
    count.runs++;
    if (done.current) return;
    done.current = true;
    registerTheme(REGISTERED_NAME, getTheme('dark'));
  }, [setPreviewTheme, count]);
  return <Text>probe</Text>;
}

async function countRuns(node: (count: Counter) => React.ReactNode): Promise<number> {
  const count: Counter = { runs: 0 };
  await renderToString(<ThemeProvider initialState="dark">{node(count)}</ThemeProvider>, 40);
  return count.runs;
}

// Skipped on CI, like AutofixProgress.test.tsx, and for a specific reason
// rather than flakiness: two test files replace the whole `@anthropic/ink`
// module via `mock.module`, substituting the bare string 'Text' for the real
// component. Bun's mock.module is process-global, so once that lands every
// later Ink render in the run dies with `Text string "…" must be rendered
// inside <Text> component`. File order differs between macOS and Linux, which
// is why this passes locally and failed only on CI. These still run on every
// local `bun run precheck`.
describe.skipIf(!!process.env.CI)('usePreviewTheme identity', () => {
  test('an effect that depends on setPreviewTheme and calls it runs twice', async () => {
    expect(await countRuns(count => <DependsOnIt count={count} />)).toBe(2);
  });

  test('reading it from a ref runs the effect once', async () => {
    expect(await countRuns(count => <ReadsItFromARef count={count} />)).toBe(1);
  });

  test('registering a theme churns the identity too', async () => {
    // Since the same-name repaint fix, the registry version is part of the
    // context value — which is what makes a refined draft actually show. It
    // also means ThemeCreator's own `registerThemeWithTraits` invalidates
    // these callbacks, so the ref above guards a second, more frequent path:
    // an effect that registers and depends on setPreviewTheme would spin.
    const count: Counter = { runs: 0 };
    await renderToString(
      <ThemeProvider initialState="dark">
        <RegistersOnce count={count} />
      </ThemeProvider>,
      40,
    );
    unregisterTheme(REGISTERED_NAME);
    expect(count.runs).toBe(2);
  });
});
