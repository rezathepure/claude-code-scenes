import { Box, Text, useTerminalSize } from '@anthropic/ink';
import * as React from 'react';
import { useModalOrTerminalSize } from '../../context/modalContext.js';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import type { ThemeSetting } from '../../utils/theme.js';
import {
  buildGridEntries,
  buildRows,
  columnCountFor,
  computeWindowStart,
  flattenBands,
  groupBands,
  moveIndex,
  rowHeight,
  rowIndexOf,
  TILE_HEIGHT,
} from './layout.js';
import { ThemeTile } from './ThemeTile.js';

/** Rows of picker chrome around the grid (headers, hints, warnings, slack). */
const CHROME_ROWS = 8;

export type ThemeGridProps = {
  currentSetting: ThemeSetting;
  builtinOptions: Array<{ label: string; value: ThemeSetting }>;
  onFocus: (setting: ThemeSetting) => void;
  onSelect: (setting: ThemeSetting) => void;
  onCancel: () => void;
};

/**
 * The 2D theme picker: bands of preview tiles, arrow-key navigation over a
 * flat index, the focused tile live-previewing its scene while the existing
 * whole-screen preview (onFocus → setPreviewTheme) recolours the app.
 *
 * Navigation registers in the already-active 'ThemePicker' keybinding
 * context, reusing the select:* actions — the same reuse pattern the
 * Settings context established.
 */
export function ThemeGrid({
  currentSetting,
  builtinOptions,
  onFocus,
  onSelect,
  onCancel,
}: ThemeGridProps): React.ReactNode {
  // Read once at mount, like the list picker — the registry is stable while
  // the dialog is open (hot reload lands on next open).
  const entries = React.useMemo(() => buildGridEntries(builtinOptions), [builtinOptions]);
  const bands = React.useMemo(() => groupBands(entries), [entries]);
  // The ONLY order a flat focus index may refer to is the banded visual one.
  // Indexing `entries` here was the launch bug where selecting the tile
  // labelled "matrix" applied "dark" (the entry at that unbanded index).
  const ordered = React.useMemo(() => flattenBands(bands), [bands]);
  const size = useModalOrTerminalSize(useTerminalSize());
  const columnCount = Math.max(2, columnCountFor(size.columns));
  const rows = React.useMemo(() => buildRows(bands, columnCount), [bands, columnCount]);

  const [focusedIndex, setFocusedIndex] = React.useState(() => {
    const found = ordered.findIndex(e => e.value === currentSetting);
    return found === -1 ? 0 : found;
  });
  const [windowStart, setWindowStart] = React.useState(0);

  const focusedValue = ordered[focusedIndex]?.value;

  React.useEffect(() => {
    if (focusedValue !== undefined) {
      onFocus(focusedValue);
    }
    // onFocus identity is unstable at call sites; firing on focus change only
    // is the contract (same as Select's onFocus).
  }, [focusedValue]);

  const move = (direction: 'up' | 'down' | 'left' | 'right'): void => {
    setFocusedIndex(i => moveIndex(rows, i, direction));
  };

  useKeybindings(
    {
      'select:previous': () => move('up'),
      'select:next': () => move('down'),
      'select:previousValue': () => move('left'),
      'select:nextValue': () => move('right'),
      'select:accept': () => {
        const value = ordered[focusedIndex]?.value;
        if (value !== undefined) onSelect(value);
      },
      'select:cancel': () => onCancel(),
    },
    { context: 'ThemePicker' },
  );

  // Window the rows so the focused one stays visible in the clipping modal.
  const rowHeights = rows.map(rowHeight);
  const focusedRow = rowIndexOf(rows, focusedIndex);
  const budget = Math.max(TILE_HEIGHT + 1, size.rows - CHROME_ROWS);
  const start = computeWindowStart(windowStart, Math.max(0, focusedRow), rowHeights, budget);
  if (start !== windowStart) {
    setWindowStart(start);
  }

  let used = 0;
  const visible: typeof rows = [];
  for (let r = start; r < rows.length; r++) {
    const h = rowHeights[r] ?? 0;
    if (used + h > budget) break;
    visible.push(rows[r]!);
    used += h;
  }
  const hiddenAbove = start;
  const hiddenBelow = rows.length - start - visible.length;

  return (
    <Box flexDirection="column">
      {hiddenAbove > 0 && (
        <Text dimColor>
          ↑ {hiddenAbove} more row{hiddenAbove === 1 ? '' : 's'}
        </Text>
      )}
      {visible.map(row => (
        <Box key={row.flatStart} flexDirection="column">
          {row.header !== undefined && (
            <Text bold color="permission">
              {row.header}
            </Text>
          )}
          <Box flexDirection="row" gap={1}>
            {row.entries.map((entry, i) => (
              <ThemeTile
                key={entry.value}
                entry={entry}
                focused={row.flatStart + i === focusedIndex}
                selected={entry.value === currentSetting}
              />
            ))}
          </Box>
        </Box>
      ))}
      {hiddenBelow > 0 && (
        <Text dimColor>
          ↓ {hiddenBelow} more row{hiddenBelow === 1 ? '' : 's'}
        </Text>
      )}
    </Box>
  );
}
