/**
 * Watches ~/.claude/themes so edits take effect without a restart.
 *
 * This is not a nicety — it is the fine-tuning workflow. Themes are meant to
 * be hand-editable, and adjusting a colour is a "change it, look at it, change
 * it again" loop. Without live reload every iteration costs a restart and
 * nobody bothers.
 *
 * Mirrors initializeKeybindingWatcher in src/keybindings/loadUserBindings.ts,
 * including its chokidar settings: `awaitWriteFinish` because editors write in
 * several syscalls and a half-written file parses as garbage, and `atomic`
 * because many editors save by renaming a temp file over the original.
 */

import { stat } from 'node:fs/promises'
import chokidar, { type FSWatcher } from 'chokidar'
import { registerCleanup } from '../utils/cleanupRegistry.js'
import { logForDebugging } from '../utils/debug.js'
import { createSignal } from '../utils/signal.js'
import {
  getCcThemesDir,
  getOfficialThemesDir,
  loadUserThemes,
  type ThemeLoadResult,
} from './loader.js'

/** Matches the keybindings watcher, for the same editor-write reasons. */
const FILE_STABILITY_THRESHOLD_MS = 500
const FILE_STABILITY_POLL_INTERVAL_MS = 200

/**
 * Reloads are debounced: saving a file often produces several events, and a
 * "save all" across a few theme files would otherwise rescan once per file.
 */
const RELOAD_DEBOUNCE_MS = 300

/** Emitted after a reload, for anything wanting to surface fresh warnings. */
export const themesChanged = createSignal<[result: ThemeLoadResult]>()

let watcher: FSWatcher | undefined
let initialized = false
let disposed = false
let reloadTimer: ReturnType<typeof setTimeout> | undefined

async function reload(): Promise<void> {
  try {
    const result = await loadUserThemes()
    // Registering inside loadUserThemes already notifies ThemeProvider, so the
    // UI repaints on its own; this signal is for warning surfaces.
    themesChanged.emit(result)
    logForDebugging(`[themes] Reloaded ${result.themes.length} user theme(s)`)
  } catch (error) {
    // loadUserThemes is written not to throw, but a watcher callback that
    // rejects would take down the process, so belt and braces.
    logForDebugging(`[themes] Reload failed: ${String(error)}`, {
      level: 'warn',
    })
  }
}

function scheduleReload(): void {
  if (disposed) return
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => {
    reloadTimer = undefined
    void reload()
  }, RELOAD_DEBOUNCE_MS)
}

/**
 * Starts watching both theme directories — ours (~/.claude/cc-themes, always
 * created by migrateLegacyThemes before this runs) and official's
 * (~/.claude/themes, watched so an edit made through official Claude Code
 * shows up here live too). Directories that don't exist are skipped; noticing
 * a later-created one needs a restart, a fair trade for not watching paths
 * that usually don't exist.
 */
export async function initializeThemeWatcher(): Promise<void> {
  if (initialized || disposed) return

  const candidates = [getCcThemesDir(), getOfficialThemesDir()]
  const dirs: string[] = []
  for (const dir of candidates) {
    try {
      const stats = await stat(dir)
      if (stats.isDirectory()) {
        dirs.push(dir)
      }
    } catch {
      logForDebugging(`[themes] Not watching ${dir}: does not exist`)
    }
  }
  if (dirs.length === 0) {
    return
  }

  initialized = true
  logForDebugging(`[themes] Watching ${dirs.join(', ')} for changes`)

  watcher = chokidar.watch(dirs, {
    persistent: true,
    ignoreInitial: true,
    depth: 0,
    awaitWriteFinish: {
      stabilityThreshold: FILE_STABILITY_THRESHOLD_MS,
      pollInterval: FILE_STABILITY_POLL_INTERVAL_MS,
    },
    ignorePermissionErrors: true,
    usePolling: false,
    atomic: true,
  })

  // A full rescan on any event, rather than tracking individual files. The
  // directory holds a handful of small files, and rescanning is what makes
  // deletion work correctly without extra bookkeeping.
  watcher.on('add', scheduleReload)
  watcher.on('change', scheduleReload)
  watcher.on('unlink', scheduleReload)

  registerCleanup(async () => disposeThemeWatcher())
}

export function disposeThemeWatcher(): void {
  disposed = true
  if (reloadTimer) {
    clearTimeout(reloadTimer)
    reloadTimer = undefined
  }
  void watcher?.close()
  watcher = undefined
  initialized = false
}

/** Test seam: allows re-initialising after a dispose. */
export function resetThemeWatcherState(): void {
  disposed = false
  initialized = false
}
