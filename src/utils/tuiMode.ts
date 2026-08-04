/**
 * The persisted preference for alt-screen (fullscreen) rendering.
 *
 * Lives here rather than in src/commands/tui/ because src/utils/fullscreen.ts
 * has to read it, and a low-level util importing a slash command would invert
 * the dependency direction.
 *
 * ## Why the preference exists at all
 *
 * Scenes — the animated theme backdrops this fork is built around — only
 * paint in the alternate screen buffer, because that is the only mode with a
 * full-screen cell grid to paint the empty cells of. Upstream defaults
 * alt-screen to on for Anthropic-internal users and off for everyone else, so
 * a fresh external install rendered every animated theme as a still palette.
 * For a project whose headline feature is the animation, off-by-default is
 * the wrong default, so an absent preference now means ON.
 *
 * ## Tri-state, and why
 *
 * `/tui on` used to write a marker file and `/tui off` used to delete it,
 * with "file present" meaning enabled. That cannot express "the user
 * explicitly wants this off" once absent means on, so the file's *contents*
 * carry the state and absence means "never chosen".
 *
 * Older markers hold an ISO timestamp. Those parse as 'on', which is exactly
 * what they used to mean, so upgrading does not silently flip anyone.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getClaudeConfigHomeDir } from './envUtils.js'

export type TuiPreference = 'on' | 'off' | 'unset'

/** Written verbatim; anything else in the file reads as 'on'. */
const OFF_MARKER = 'off'

export function getTuiMarkerPath(): string {
  return join(getClaudeConfigHomeDir(), '.tui-mode')
}

/**
 * Cached for the session. `isFullscreenEnvEnabled` is called from render
 * paths dozens of times per frame, so this must not touch the filesystem on
 * every call — and the answer cannot usefully change mid-session anyway,
 * since alt-screen cannot be entered after the Ink tree is mounted.
 */
let cached: TuiPreference | undefined

export function getTuiPreference(): TuiPreference {
  if (cached !== undefined) return cached
  cached = readTuiPreference()
  return cached
}

function readTuiPreference(): TuiPreference {
  try {
    const path = getTuiMarkerPath()
    if (!existsSync(path)) return 'unset'
    return readFileSync(path, 'utf8').trim().toLowerCase() === OFF_MARKER
      ? 'off'
      : 'on'
  } catch {
    // An unreadable config dir is not a reason to change how the UI renders.
    return 'unset'
  }
}

/**
 * Records the preference. Takes effect on the next session start — the
 * alternate screen buffer cannot be entered retroactively.
 */
export function setTuiPreference(preference: 'on' | 'off'): void {
  mkdirSync(getClaudeConfigHomeDir(), { recursive: true })
  writeFileSync(
    getTuiMarkerPath(),
    preference === 'off' ? OFF_MARKER : new Date().toISOString(),
    'utf8',
  )
  cached = preference
}

/** Whether alt-screen should be used, absent an env override. */
export function isTuiModeEnabled(): boolean {
  return getTuiPreference() !== 'off'
}

/** Test-only: drop the cached read. */
export function _resetTuiPreferenceForTesting(): void {
  cached = undefined
}
