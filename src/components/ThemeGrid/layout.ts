/**
 * Pure layout math for the theme grid: which tiles exist, how they group
 * into bands, how arrow keys move focus across a flat index, and which rows
 * fit the vertical budget. No React, fully unit-tested.
 */

import { getSceneConfig } from '../../scene/registry.js'
import { sceneLabelOf } from '../../scene/label.js'
import { getThemeMeta, type ThemeOrigin } from '../../themes/meta.js'
import {
  getRegisteredThemeNames,
  THEME_NAMES,
  type ThemeSetting,
} from '../../utils/theme.js'

export const TILE_WIDTH = 28
export const TILE_HEIGHT = 7
export const TILE_INNER_WIDTH = 26
/** Terminal columns below which grid mode falls back to the flat list. */
export const MIN_GRID_COLUMNS = 60

export type GridEntry = {
  /** What onThemeSelect receives — 'auto' or a theme name. */
  value: ThemeSetting
  /** Fed to getTheme() for tile colours ('auto' previews as dark). */
  paletteName: string
  label: string
  mode: 'dark' | 'light'
  /**
   * The scene's display name, or null when the theme does not animate. A
   * composed scene has no single `kind` to print, so the model names it.
   */
  sceneLabel: string | null
  /** The theme's own one-line description, when it has one. */
  description?: string
  origin: ThemeOrigin
  /**
   * A tile that is not a theme. 'create' is the "design your own" promo tile:
   * it never previews, never matches currentSetting, and selecting it starts
   * the creation flow instead of applying anything.
   */
  special?: 'create'
}

/** Sentinel value for the create tile — never a real theme name. */
export const CREATE_TILE_VALUE = '__create-theme__' as ThemeSetting

export type GridBandKey =
  | 'create'
  | 'animated'
  | 'builtin'
  | 'custom'
  | 'official'
export type GridBand = { key: GridBandKey; title: string; entries: GridEntry[] }
export type GridRow = {
  /** Band title, present on the band's first row only. */
  header?: string
  entries: GridEntry[]
  /** Flat index of entries[0], for focus mapping. */
  flatStart: number
}

/**
 * Every pickable theme as a grid entry.
 *
 * `builtinOptions` is the picker's existing curated list (labels + order,
 * including 'auto' when the feature is on) so the two layouts can never
 * disagree about built-in naming.
 */
export function buildGridEntries(
  builtinOptions: Array<{ label: string; value: ThemeSetting }>,
  opts?: { includeCreate?: boolean },
): GridEntry[] {
  const entries: GridEntry[] = []

  for (const option of builtinOptions) {
    const name = option.value === 'auto' ? 'dark' : option.value
    entries.push({
      value: option.value,
      paletteName: name,
      label: option.label,
      mode: name.includes('light') ? 'light' : 'dark',
      sceneLabel: null,
      origin: 'builtin',
    })
  }

  const builtinNames = new Set<string>(THEME_NAMES)
  const extras = getRegisteredThemeNames()
    .filter(name => !builtinNames.has(name))
    .sort()
  for (const name of extras) {
    const meta = getThemeMeta(name)
    entries.push({
      value: name as ThemeSetting,
      paletteName: name,
      label: name,
      mode: meta?.mode ?? 'dark',
      sceneLabel: sceneLabelOf(getSceneConfig(name)),
      ...(meta?.description !== undefined
        ? { description: meta.description }
        : {}),
      origin: meta?.origin ?? 'cc',
    })
  }

  if (opts?.includeCreate) {
    // Position in this list does not matter: bandKeyFor puts it in the
    // 'create' band, which groupBands orders first.
    entries.push({
      value: CREATE_TILE_VALUE,
      paletteName: 'dark',
      label: 'Create your own',
      mode: 'dark',
      sceneLabel: null,
      origin: 'cc',
      special: 'create',
    })
  }

  return entries
}

const BAND_TITLES: Record<GridBandKey, string> = {
  // No header: the banner is its own headline.
  create: '',
  animated: '✦ Animated',
  builtin: 'Built-in',
  custom: 'Custom',
  official: 'Custom (official)',
}

function bandKeyFor(entry: GridEntry): GridBandKey {
  // Its own band, above everything. It used to close the Animated band,
  // where it read as one more theme among several; leading the grid full
  // width is what makes it an invitation rather than an option.
  if (entry.special === 'create') return 'create'
  // Animation trumps origin: matrix and sakura lead the picker — they are
  // the product — wherever they come from.
  if (entry.sceneLabel !== null) return 'animated'
  if (entry.origin === 'official') return 'official'
  if (entry.origin === 'cc') return 'custom'
  // builtin and (non-animated) bundled read as "shipped with the app".
  return 'builtin'
}

/** Groups entries into ordered bands; empty bands are omitted. */
export function groupBands(entries: GridEntry[]): GridBand[] {
  const order: GridBandKey[] = [
    'create',
    'animated',
    'builtin',
    'custom',
    'official',
  ]
  const byKey = new Map<GridBandKey, GridEntry[]>()
  for (const entry of entries) {
    const key = bandKeyFor(entry)
    const list = byKey.get(key)
    if (list) list.push(entry)
    else byKey.set(key, [entry])
  }
  return order
    .filter(key => byKey.has(key))
    .map(key => ({ key, title: BAND_TITLES[key], entries: byKey.get(key)! }))
}

/**
 * Bands flattened back into a single list in VISUAL order — the order every
 * flat focus index refers to.
 *
 * Focus math must never index the pre-banding entries array: banding reorders
 * entries (animated first), so the two orders disagree, and selecting the
 * tile labelled "matrix" would apply whatever happens to sit at that index in
 * the unbanded list.
 */
export function flattenBands(bands: GridBand[]): GridEntry[] {
  return bands.flatMap(band => band.entries)
}

/**
 * Columns of tiles that fit, 2-4, or 0 meaning "too narrow — use the list".
 * Tiles are separated by one column of gap.
 */
export function columnCountFor(availableColumns: number): number {
  if (availableColumns < MIN_GRID_COLUMNS) return 0
  const fit = Math.floor((availableColumns + 1) / (TILE_WIDTH + 1))
  return Math.max(2, Math.min(4, fit))
}

/** The row a flat index sits in, or -1 when out of range. */
export function rowIndexOf(rows: GridRow[], flatIndex: number): number {
  return rows.findIndex(
    row =>
      flatIndex >= row.flatStart &&
      flatIndex < row.flatStart + row.entries.length,
  )
}

/**
 * Arrow-key movement over the rendered rows.
 *
 * Left/right step ±1 through visual order and flow across row boundaries.
 * Up/down move to the SAME COLUMN of the adjacent row, clamped to that row's
 * length — rows must be consulted rather than stepping ±columnCount, because
 * every band starts a fresh row: a two-tile Animated band in a four-column
 * grid means the tile "below" matrix is NOT four indices away.
 */
export function moveIndex(
  rows: GridRow[],
  index: number,
  direction: 'up' | 'down' | 'left' | 'right',
): number {
  if (rows.length === 0) return 0
  const last = rows[rows.length - 1]!
  const count = last.flatStart + last.entries.length
  switch (direction) {
    case 'left':
      return Math.max(0, index - 1)
    case 'right':
      return Math.min(count - 1, index + 1)
    case 'up':
    case 'down': {
      const r = rowIndexOf(rows, index)
      if (r === -1) return Math.min(Math.max(index, 0), count - 1)
      const target = direction === 'up' ? r - 1 : r + 1
      if (target < 0 || target >= rows.length) return index
      const column = index - rows[r]!.flatStart
      const row = rows[target]!
      return row.flatStart + Math.min(column, row.entries.length - 1)
    }
  }
}

/** Chunks bands into visual rows of at most columnCount tiles. */
export function buildRows(bands: GridBand[], columnCount: number): GridRow[] {
  const rows: GridRow[] = []
  let flat = 0
  for (const band of bands) {
    // The create banner spans the full grid width, so it is always alone on
    // its row whatever the column count.
    const perRow = band.key === 'create' ? 1 : columnCount
    for (let i = 0; i < band.entries.length; i += perRow) {
      const row: GridRow = {
        entries: band.entries.slice(i, i + perRow),
        flatStart: flat,
      }
      // Empty title (the create banner) means no header row at all —
      // rowHeight keys off header presence, so it must not be set to ''.
      if (i === 0 && band.title !== '') row.header = band.title
      rows.push(row)
      flat += row.entries.length
    }
  }
  return rows
}

/** Height of one rendered row: its tiles plus an optional header line. */
export function rowHeight(row: GridRow): number {
  return TILE_HEIGHT + (row.header !== undefined ? 1 : 0)
}

/**
 * First visible row index such that the focused row fits in `budget` rows,
 * moving the previous window as little as possible (stable while scrolling).
 */
export function computeWindowStart(
  previousStart: number,
  focusedRow: number,
  rowHeights: number[],
  budget: number,
): number {
  let start = Math.min(previousStart, focusedRow)

  const fits = (from: number): boolean => {
    let used = 0
    for (let r = from; r <= focusedRow; r++) {
      used += rowHeights[r] ?? 0
    }
    return used <= budget
  }

  while (start < focusedRow && !fits(start)) {
    start++
  }
  return start
}
