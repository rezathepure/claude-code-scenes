import { afterEach, describe, expect, test } from 'bun:test';
import * as React from 'react';
import { getTheme } from '../../../utils/theme.js';
import { registerThemeWithTraits, unregisterThemeWithTraits } from '../../../themes/register.js';
import { renderToString } from '../../../utils/staticRender.js';
import type { GridEntry } from '../layout.js';
import { ThemeTile } from '../ThemeTile.js';

const registered: string[] = [];
afterEach(() => {
  while (registered.length > 0) {
    unregisterThemeWithTraits(registered.pop()!);
  }
});

function makeEntry(partial: Partial<GridEntry>): GridEntry {
  return {
    value: 'dark',
    paletteName: 'dark',
    label: 'Dark mode',
    mode: 'dark',
    sceneKind: 'none',
    origin: 'builtin',
    ...partial,
  } as GridEntry;
}

describe('ThemeTile', () => {
  test('renders label, mock rows and mode footer', async () => {
    const out = await renderToString(<ThemeTile entry={makeEntry({})} focused={false} selected={false} />, 40);

    expect(out).toContain('● Dark mode');
    expect(out).toContain('❯ Read');
    expect(out).toContain('+ resolved()');
    expect(out).toContain('12k tokens');
    expect(out).toContain('dark');
  });

  test('shows the scene kind suffix and the selected checkmark', async () => {
    registerThemeWithTraits(
      'test-tile9',
      getTheme('dark'),
      'dark',
      {
        kind: 'rain',
        params: {
          density: 0.33,
          speedMin: 0.3,
          speedMax: 1.2,
          trailMin: 6,
          trailMax: 26,
          mutateRate: 0.01,
          intensity: 1,
        },
      },
      { origin: 'cc' },
    );
    registered.push('test-tile9');

    const out = await renderToString(
      <ThemeTile
        entry={makeEntry({
          value: 'test-tile9',
          paletteName: 'test-tile9',
          label: 'test-tile9',
          sceneKind: 'rain',
          origin: 'cc',
        })}
        focused={false}
        selected={true}
      />,
      40,
    );

    // A 10-char name leaves room for the suffix; the checkmark renders right
    // after the bullet so it survives truncation even for long names.
    expect(out).toContain('✓ test-tile9');
    expect(out).toContain('✦ rain');
    // The footer names the current theme outright — the checkmark alone was
    // too easy to miss.
    expect(out).toContain('dark · current');
  });
});
