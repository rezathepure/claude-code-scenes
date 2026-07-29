import { afterEach, describe, expect, test } from 'bun:test';
import * as React from 'react';
import { getTheme } from '../../../utils/theme.js';
import { registerThemeWithTraits, unregisterThemeWithTraits } from '../../../themes/register.js';
import { renderToString } from '../../../utils/staticRender.js';
import type { GridEntry } from '../layout.js';
import { defaultRainParams } from '../../../scene/types.js';
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
    sceneLabel: null,
    origin: 'builtin',
    ...partial,
  } as GridEntry;
}

describe('ThemeTile', () => {
  test('renders label, palette swatches and mode footer', async () => {
    const out = await renderToString(<ThemeTile entry={makeEntry({})} focused={false} selected={false} />, 40);

    expect(out).toContain('● Dark mode');
    expect(out).toContain('███');
    expect(out).toContain('dark');
    // The mock session is gone: it described work that was not happening.
    expect(out).not.toContain('resolved()');
    expect(out).not.toContain('12k tokens');
  });

  test('shows a theme its own description instead of filler', async () => {
    const out = await renderToString(
      <ThemeTile
        entry={makeEntry({
          value: 'test-only-desc' as GridEntry['value'],
          label: 'test-only-desc',
          origin: 'cc',
          description: 'Neon violet through acid rain',
        })}
        focused={false}
        selected={false}
      />,
      40,
    );
    expect(out).toContain('Neon violet');
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
          sceneLabel: 'rain',
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

  test('renders the create promo tile instead of theme mocks', async () => {
    const out = await renderToString(
      <ThemeTile entry={makeEntry({ label: 'Create your own', special: 'create' })} focused={false} selected={false} />,
      40,
    );

    expect(out).toContain('✦ Create your own');
    expect(out).toContain('Enter to start');
    // None of the theme-tile mock content leaks into the promo tile.
    expect(out).not.toContain('❯ Read');
    expect(out).not.toContain('12k tokens');
  });
});

describe('the delete confirmation', () => {
  test('asks inside the tile, naming the theme it would destroy', async () => {
    // In place rather than in a bar below the grid: the thing being destroyed
    // should be the thing you are looking at while you decide.
    const out = await renderToString(
      <ThemeTile
        entry={makeEntry({ value: 'mine' as GridEntry['value'], label: 'mine', origin: 'cc' })}
        focused
        selected={false}
        confirming={{ blocked: null }}
      />,
      40,
    );
    expect(out).toContain('Delete this theme?');
    expect(out).toContain('mine'); // the tile header still names it
    expect(out).toContain('d');
    expect(out).toContain('Esc to keep it');
  });

  test('explains a refusal instead of asking a question it cannot honour', async () => {
    const out = await renderToString(
      <ThemeTile entry={makeEntry({})} focused selected={false} confirming={{ blocked: '“dark” is built in.' }} />,
      40,
    );
    expect(out).toContain('Cannot delete');
    expect(out).toContain('built in');
    expect(out).not.toContain('again to delete');
  });

  test('hides the scene preview while confirming', async () => {
    // The tile has four inner rows; the confirmation needs all of them.
    registerThemeWithTraits('test-only-confirm', getTheme('dark'), 'dark', {
      kind: 'rain',
      params: defaultRainParams(),
    });
    registered.push('test-only-confirm');

    const out = await renderToString(
      <ThemeTile
        entry={makeEntry({
          value: 'test-only-confirm' as GridEntry['value'],
          paletteName: 'dark',
          label: 'test-only-confirm',
          sceneLabel: 'rain',
          origin: 'cc',
        })}
        focused
        selected={false}
        confirming={{ blocked: null }}
      />,
      40,
    );
    expect(out).toContain('Delete');
    expect(out).not.toContain('12k tokens');
  });
});
