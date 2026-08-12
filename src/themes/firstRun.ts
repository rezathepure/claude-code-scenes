import type { ThemeSetting } from '../utils/theme.js'

export const THEME_DISCOVERY_HINT_MAX_SHOW_COUNT = 2

type ThemeExperienceState = {
  theme: ThemeSetting
  ccsThemeHintSeenCount?: number
}

type ThemeExperiencePatch = {
  theme: ThemeSetting
  ccsThemeHintSeenCount: number
}

/**
 * Builds the one-time CCS theme setup patch.
 *
 * The global config is shared with official Claude Code, so a first-time CCS
 * user commonly arrives with `theme: "dark"` already persisted. Writing the
 * matrix starter is the reliable signal that this is their first CCS launch.
 * An existing CCS installation gets the hint marked complete without changing
 * its selected theme.
 */
export function getInitialThemeExperiencePatch(
  current: ThemeExperienceState,
  seededThemes: readonly string[],
): ThemeExperiencePatch | null {
  if (current.ccsThemeHintSeenCount !== undefined) return null

  const isFirstCcsLaunch = seededThemes.includes('matrix')
  return {
    theme: isFirstCcsLaunch ? 'matrix' : current.theme,
    ccsThemeHintSeenCount: isFirstCcsLaunch
      ? 0
      : THEME_DISCOVERY_HINT_MAX_SHOW_COUNT,
  }
}

export function shouldShowThemeDiscoveryHint(
  seenCount: number | undefined,
): boolean {
  return (
    seenCount !== undefined && seenCount < THEME_DISCOVERY_HINT_MAX_SHOW_COUNT
  )
}
