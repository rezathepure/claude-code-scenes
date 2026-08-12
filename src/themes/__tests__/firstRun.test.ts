import { describe, expect, test } from 'bun:test'
import {
  getInitialThemeExperiencePatch,
  shouldShowThemeDiscoveryHint,
  THEME_DISCOVERY_HINT_MAX_SHOW_COUNT,
} from '../firstRun.js'

describe('getInitialThemeExperiencePatch', () => {
  test('selects matrix and enables the hint on the first CCS launch', () => {
    expect(
      getInitialThemeExperiencePatch({ theme: 'dark' }, [
        'matrix',
        'sakura',
        'winter',
      ]),
    ).toEqual({
      theme: 'matrix',
      ccsThemeHintSeenCount: 0,
    })
  })

  test('preserves the selected theme for an existing CCS installation', () => {
    expect(getInitialThemeExperiencePatch({ theme: 'sakura' }, [])).toEqual({
      theme: 'sakura',
      ccsThemeHintSeenCount: THEME_DISCOVERY_HINT_MAX_SHOW_COUNT,
    })
  })

  test('does not reinitialize an installation with recorded hint state', () => {
    expect(
      getInitialThemeExperiencePatch(
        { theme: 'winter', ccsThemeHintSeenCount: 1 },
        ['matrix'],
      ),
    ).toBeNull()
  })
})

describe('shouldShowThemeDiscoveryHint', () => {
  test('shows only for the first two CCS sessions', () => {
    expect(shouldShowThemeDiscoveryHint(undefined)).toBe(false)
    expect(shouldShowThemeDiscoveryHint(0)).toBe(true)
    expect(shouldShowThemeDiscoveryHint(1)).toBe(true)
    expect(shouldShowThemeDiscoveryHint(2)).toBe(false)
  })
})
