import { Box, Text, useTerminalSize } from '@anthropic/ink';
import * as React from 'react';
import { useModalOrTerminalSize } from '../../context/modalContext.js';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import { canDeleteTheme } from '../../themes/remove.js';
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
  TILE_WIDTH,
} from './layout.js';
import { ThemeTile } from './ThemeTile.js';

/**
 * Rows of picker chrome around the grid (headers, hints, warnings, slack).
 *
 * Raised from 8 to pay for the delete hint below the tiles AND to stop the
 * picker's own Enter/Esc footer landing on the very last terminal row, where
 * it was being clipped — which is how the delete key shipped invisible.
 */
const CHROME_ROWS = 10;

export type ThemeGridProps = {
  currentSetting: ThemeSetting;
  builtinOptions: Array<{ label: string; value: ThemeSetting }>;
  onFocus: (setting: ThemeSetting) => void;
  onSelect: (setting: ThemeSetting) => void;
  onCancel: () => void;
  /** When provided, the "Create your own" banner leads the grid. */
  onCreate?: () => void;
  /** When provided, `d` offers to delete the focused theme. */
  onDelete?: (name: ThemeSetting) => void | Promise<void>;
  /** Bumped by the parent after a delete, to rebuild the tiles. */
  generation?: number;
};

/** The tile awaiting confirmation, and why it cannot be deleted if it cannot. */
type PendingDelete = { name: ThemeSetting; blocked: string | null };

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
  onCreate,
  onDelete,
  generation = 0,
}: ThemeGridProps): React.ReactNode {
  // Read once at mount, like the list picker — the registry is stable while
  // the dialog is open (hot reload lands on next open).
  const includeCreate = onCreate !== undefined;
  const entries = React.useMemo(
    // `generation` is the parent's signal that the registry changed under us
    // — deleting a theme has to remove its tile.
    () => buildGridEntries(builtinOptions, { includeCreate }),
    [builtinOptions, includeCreate, generation],
  );
  const [pending, setPending] = React.useState<PendingDelete | null>(null);
  const bands = React.useMemo(() => groupBands(entries), [entries]);
  // The ONLY order a flat focus index may refer to is the banded visual one.
  // Indexing `entries` here was the launch bug where selecting the tile
  // labelled "matrix" applied "dark" (the entry at that unbanded index).
  const ordered = React.useMemo(() => flattenBands(bands), [bands]);
  const size = useModalOrTerminalSize(useTerminalSize());
  const columnCount = Math.max(2, columnCountFor(size.columns));
  // The create banner spans the same width the tile rows occupy, so the grid
  // reads as one block rather than a wide bar over narrower cards.
  const gridWidth = columnCount * TILE_WIDTH + (columnCount - 1);
  const rows = React.useMemo(() => buildRows(bands, columnCount), [bands, columnCount]);

  const [focusedIndex, setFocusedIndex] = React.useState(() => {
    // Start on the create banner when there is one: it leads the grid, and
    // opening the picker to a blinking invitation is the whole point of
    // promoting it. The current theme is still marked with a ✓.
    if (ordered[0]?.special === 'create') return 0;
    const found = ordered.findIndex(e => e.value === currentSetting);
    return found === -1 ? 0 : found;
  });
  const [windowStart, setWindowStart] = React.useState(0);

  // The create banner has no theme of its own, so focusing it previews the
  // theme you are actually using. It used to hold whatever you last arrowed
  // past, which meant the create screen opened under matrix's rain — reading
  // as though the theme you were about to design already existed.
  const focusedEntry = ordered[focusedIndex];
  const focusedValue =
    focusedEntry !== undefined && focusedEntry.special === undefined ? focusedEntry.value : currentSetting;

  React.useEffect(() => {
    onFocus(focusedValue);
    // onFocus identity is unstable at call sites; firing on focus change only
    // is the contract (same as Select's onFocus).
  }, [focusedValue]);

  const move = (direction: 'up' | 'down' | 'left' | 'right'): void => {
    setFocusedIndex(i => moveIndex(rows, i, direction));
  };

  // A key that is not `d` clears a pending confirmation rather than acting on
  // it, so the only way to delete is to press d twice in a row on one tile.
  const clearPending = (): boolean => {
    if (pending === null) return false;
    setPending(null);
    return true;
  };

  useKeybindings(
    {
      'select:previous': () => {
        clearPending();
        move('up');
      },
      'select:next': () => {
        clearPending();
        move('down');
      },
      'select:previousValue': () => {
        clearPending();
        move('left');
      },
      'select:nextValue': () => {
        clearPending();
        move('right');
      },
      'select:accept': () => {
        // Enter while confirming means "no" — selecting the theme you were
        // about to delete would be a nasty surprise.
        if (clearPending()) return;
        const entry = ordered[focusedIndex];
        if (entry === undefined) return;
        if (entry.special === 'create') {
          onCreate?.();
          return;
        }
        onSelect(entry.value);
      },
      'select:cancel': () => {
        // Esc backs out of the confirmation before it backs out of the picker.
        if (clearPending()) return;
        onCancel();
      },
      'theme:delete': () => {
        const entry = ordered[focusedIndex];
        if (entry === undefined || entry.special === 'create') return;

        if (pending?.name === entry.value) {
          setPending(null);
          void onDelete?.(entry.value);
          return;
        }

        const eligibility = canDeleteTheme(entry.value);
        setPending(
          eligibility.deletable
            ? { name: entry.value, blocked: null }
            : { name: entry.value, blocked: eligibility.reason },
        );
      },
    },
    { context: 'ThemePicker' },
  );

  // Deleting the last tile in the grid leaves the focus index past the end.
  // Same in-render correction the window start uses below.
  if (focusedIndex >= ordered.length && ordered.length > 0) {
    setFocusedIndex(ordered.length - 1);
  }

  const deleteHint = React.useMemo(() => {
    if (onDelete === undefined || pending !== null) return '';
    const entry = ordered[focusedIndex];
    if (entry === undefined || entry.special === 'create') return '';
    return canDeleteTheme(entry.value).deletable ? `d  delete “${entry.label}”` : '';
  }, [onDelete, pending, ordered, focusedIndex]);

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
      {/* Always one row, even when empty. These three lines used to render
          conditionally, so the grid changed height on almost every arrow
          press — and a bottom-anchored modal that changes height pushes fresh
          lines into the transcript above it. Reserving the row costs nothing
          and keeps the frame a fixed size. */}
      <Text dimColor>{hiddenAbove > 0 ? `↑ ${hiddenAbove} more row${hiddenAbove === 1 ? '' : 's'}` : ' '}</Text>
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
                {...(pending?.name === entry.value ? { confirming: { blocked: pending.blocked } } : {})}
                {...(entry.special === 'create' ? { bannerWidth: gridWidth } : {})}
              />
            ))}
          </Box>
        </Box>
      ))}
      <Text dimColor>{hiddenBelow > 0 ? `↓ ${hiddenBelow} more row${hiddenBelow === 1 ? '' : 's'}` : ' '}</Text>
      {/* Taught here rather than only in the picker's footer: this is where
          the user is looking, and it names the tile it would act on. Blank
          when the focused theme cannot be deleted, so the hint is never an
          offer we would refuse — but the row is always there. */}
      <Text dimColor italic>
        {deleteHint === '' ? ' ' : deleteHint}
      </Text>
    </Box>
  );
}
