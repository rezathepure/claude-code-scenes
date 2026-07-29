/**
 * The scripted session the theme is judged against.
 *
 * Two properties this file exists to hold. The fitting is monotonic and never
 * drops the teaching lines, so a short terminal degrades to the copy that
 * matters instead of an arbitrary prefix. And the script genuinely covers the
 * palette — a preview that quietly stopped exercising `warning` would leave the
 * user tuning a colour they cannot see.
 */

import { describe, expect, test } from 'bun:test';
import { ThemeProvider } from '@anthropic/ink';
import * as React from 'react';
import { AppStoreContext, getDefaultAppState } from '../../../state/AppState.js';
import { createStore } from '../../../state/store.js';
import { getKnownSlotNames } from '../../../themes/schema.js';
import { renderToString } from '../../../utils/staticRender.js';
import { SAMPLE_LINES, SampleSession, sampleLinesForRows } from '../SampleSession.js';

/** Rows the full script needs. */
const FULL_ROWS = SAMPLE_LINES.reduce((n, l) => n + l.rows, 0);

/**
 * The lighter of the two AppState seams. `AppStateProvider` itself mounts
 * Mailbox and Voice providers, which never settle — a static render inside one
 * hangs forever. StructuredDiff only needs the store, and the store's context
 * is exported separately.
 */
function harness(node: React.ReactNode): React.ReactNode {
  return (
    <AppStoreContext.Provider value={createStore(getDefaultAppState())}>
      <ThemeProvider initialState="dark">{node}</ThemeProvider>
    </AppStoreContext.Provider>
  );
}

describe('sampleLinesForRows', () => {
  test('the whole script fits its own row count', () => {
    expect(sampleLinesForRows(FULL_ROWS).map(l => l.id)).toEqual(SAMPLE_LINES.map(l => l.id));
  });

  test('is monotonic — a taller terminal only ever adds lines', () => {
    let previous: string[] = [];
    for (let budget = 0; budget <= FULL_ROWS + 4; budget++) {
      const ids = sampleLinesForRows(budget).map(l => l.id);
      // Every line that fit at a smaller budget still fits at this one.
      expect(ids).toEqual(expect.arrayContaining(previous));
      expect(ids.reduce((n, id) => n + SAMPLE_LINES.find(l => l.id === id)!.rows, 0)).toBeLessThanOrEqual(budget);
      previous = ids;
    }
  });

  test('keeps the teaching lines longest', () => {
    // Whatever else goes, the two lines that tell you how to phrase a
    // refinement are the last to be dropped — they are the reason the copy is
    // written this way rather than being filler around the colours.
    const teaching = SAMPLE_LINES.filter(l => l.priority === 10).map(l => l.id);
    expect(teaching).toEqual(['prompt', 'teach-slots']);
    expect(sampleLinesForRows(3).map(l => l.id)).toEqual(teaching);
  });

  test('drops the failing call and its reason together', () => {
    // A red Bash bullet with no error under it reads as a bug in the preview.
    for (let budget = 0; budget <= FULL_ROWS; budget++) {
      const ids = new Set(sampleLinesForRows(budget).map(l => l.id));
      expect(ids.has('check')).toBe(ids.has('check-result'));
    }
  });

  test('renders nothing rather than a fragment below three rows', () => {
    expect(sampleLinesForRows(2)).toEqual([]);
    expect(sampleLinesForRows(0)).toEqual([]);
  });
});

describe('SAMPLE_LINES', () => {
  test('every declared slot is a real one', () => {
    const known = new Set(getKnownSlotNames());
    for (const line of SAMPLE_LINES) {
      for (const slot of line.slots) {
        expect({ line: line.id, slot, known: known.has(slot) }).toEqual({ line: line.id, slot, known: true });
      }
    }
  });

  test('covers the slots a session is actually judged on', () => {
    // Not every slot — subagent colours and the rainbow need a scenario this
    // session does not have. These are the ones you look at every day.
    const covered = new Set(SAMPLE_LINES.flatMap(l => l.slots));
    for (const slot of [
      'text',
      'subtle',
      'inactive',
      'permission',
      'success',
      'error',
      'warning',
      'bashBorder',
      'suggestion',
      'remember',
      'background',
      'diffAdded',
      'diffRemoved',
      'diffAddedWord',
      'diffRemovedWord',
    ]) {
      expect({ slot, covered: covered.has(slot) }).toEqual({ slot, covered: true });
    }
  });

  test('ids are unique, so the render keys are stable', () => {
    expect(new Set(SAMPLE_LINES.map(l => l.id)).size).toBe(SAMPLE_LINES.length);
  });
});

describe('SampleSession', () => {
  test('renders the whole script, teaching copy included', async () => {
    const out = await renderToString(harness(<SampleSession width={74} rows={FULL_ROWS} skipHighlighting />), 78);

    expect(out).toContain('make errors louder and tool output quieter');
    // Asserted in fragments: the teaching line is two rows, so the rendered
    // text has a wrap in the middle of it.
    expect(out).toContain('Name a slot or an element, not a mood');
    expect(out).toContain('slots refine one.');
    expect(out).toContain('⎿');
    expect(out).toContain("+ export const warning = 'rgb(230,160,60)'");
    expect(out).toContain('2 background tasks');
  });

  test('a short panel keeps the teaching copy and drops the rest', async () => {
    const out = await renderToString(harness(<SampleSession width={74} rows={3} skipHighlighting />), 78);

    // Asserted in fragments: the teaching line is two rows, so the rendered
    // text has a wrap in the middle of it.
    expect(out).toContain('Name a slot or an element, not a mood');
    expect(out).toContain('slots refine one.');
    expect(out).not.toContain('background tasks');
    expect(out.split('\n').filter(l => l.trim() !== '')).toHaveLength(3);
  });

  test('describes no work that is not happening', async () => {
    // The picker tiles once carried a mock session — "Read src/app.ts",
    // "12k tokens" — that was removed for inventing activity. Every line here
    // is about the theme being designed; keep it that way.
    const out = await renderToString(harness(<SampleSession width={74} rows={FULL_ROWS} skipHighlighting />), 78);
    expect(out).not.toContain('12k tokens');
    expect(out).not.toContain('resolved()');
  });
});
