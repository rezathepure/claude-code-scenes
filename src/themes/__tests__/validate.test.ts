import { describe, expect, test } from 'bun:test'
import { getTheme } from '../../utils/theme.js'
import { describeIssue, validateThemeColors } from '../validate.js'

/**
 * The Matrix and Sakura palettes as specified in their artifacts, mapped onto
 * the slots this codebase actually has. Only the slots the artifacts define.
 */
const MATRIX = {
  text: 'rgb(200,245,205)',
  inactive: 'rgb(92,150,108)',
  subtle: 'rgb(92,150,108)',
  claude: 'rgb(0,255,65)',
  promptBorder: 'rgb(0,255,65)',
  suggestion: 'rgb(60,230,200)',
  success: 'rgb(0,255,65)',
  warning: 'rgb(230,160,50)',
  error: 'rgb(255,90,70)',
  remember: 'rgb(255,183,0)',
  merged: 'rgb(60,230,200)',
}

const SAKURA = {
  text: 'rgb(250,236,244)',
  inactive: 'rgb(178,142,168)',
  subtle: 'rgb(178,142,168)',
  claude: 'rgb(255,138,190)',
  promptBorder: 'rgb(255,138,190)',
  suggestion: 'rgb(135,220,215)',
  success: 'rgb(135,220,215)',
  warning: 'rgb(245,168,118)',
  error: 'rgb(255,92,105)',
  remember: 'rgb(255,200,130)',
  merged: 'rgb(135,220,215)',
}

describe('the reference themes survive validation untouched', () => {
  // The calibration target from the plan. Matrix and Sakura are hand-designed
  // and read well; if the validator changes either one, the floors are set too
  // strictly and are about to flatten exactly the themes this feature exists
  // to allow.
  for (const [name, palette] of [
    ['matrix', MATRIX],
    ['sakura', SAKURA],
  ] as const) {
    test(`${name} is returned byte-identical with no issues at all`, () => {
      const { colors, issues } = validateThemeColors({ ...palette }, 'dark')

      // Not "no repairs" — no complaints of any kind, including distinctness.
      expect(issues).toEqual([])
      expect(colors).toEqual(palette)
    })
  }
})

describe('unparseable colours', () => {
  test('are reported rather than silently rendering uncoloured', () => {
    const { issues } = validateThemeColors(
      { text: 'rgb(200,245,205)', error: 'rebeccapurple' },
      'dark',
    )

    const bad = issues.find(i => i.kind === 'unparseable')
    expect(bad).toBeDefined()
    expect(bad).toMatchObject({ slot: 'error', value: 'rebeccapurple' })
  })
})

describe('contrast repair', () => {
  test('brightens near-invisible text and says so', () => {
    const { colors, issues } = validateThemeColors(
      { text: 'rgb(200,245,205)', error: 'rgb(40,18,18)' },
      'dark',
    )

    expect(colors.error).not.toBe('rgb(40,18,18)')

    const repair = issues.find(i => i.kind === 'repaired-contrast')
    expect(repair).toMatchObject({ slot: 'error' })
    if (repair?.kind === 'repaired-contrast') {
      expect(repair.ratioAfter).toBeGreaterThan(repair.ratioBefore)
    }
  })

  test('holds body text to a higher bar than status labels', () => {
    // The same colour is acceptable as a status label but not as prose.
    const dim = 'rgb(90,90,90)'

    const asBody = validateThemeColors({ text: dim }, 'dark')
    const asLabel = validateThemeColors({ warning: dim }, 'dark')

    expect(asBody.colors.text).not.toBe(dim)
    expect(asLabel.colors.warning).toBe(dim)
  })

  test('leaves ANSI palette values alone', () => {
    // Their real appearance is chosen by the terminal, so a computed ratio
    // would be fiction and a "repair" would override the user's palette.
    const { colors, issues } = validateThemeColors(
      { text: 'ansi:white', error: 'ansi:red' },
      'dark',
    )

    expect(colors.text).toBe('ansi:white')
    expect(colors.error).toBe('ansi:red')
    expect(issues).toEqual([])
  })
})

describe('distinctness', () => {
  test('flags an error colour that looks like the warning colour', () => {
    const { issues } = validateThemeColors(
      {
        error: 'rgb(255,90,70)',
        warning: 'rgb(253,94,74)',
        success: 'rgb(0,255,65)',
      },
      'dark',
    )

    const clash = issues.find(i => i.kind === 'indistinct')
    expect(clash).toBeDefined()
    if (clash?.kind === 'indistinct') {
      expect(clash.slots).toEqual(['error', 'warning'])
    }
  })

  test('does not flag genuinely different colours', () => {
    const { issues } = validateThemeColors(
      {
        error: 'rgb(255,90,70)',
        warning: 'rgb(230,160,50)',
        success: 'rgb(0,255,65)',
      },
      'dark',
    )

    expect(issues.filter(i => i.kind === 'indistinct')).toEqual([])
  })

  test('reports rather than repairs, leaving the colours as authored', () => {
    const input = { error: 'rgb(255,90,70)', warning: 'rgb(253,94,74)' }
    const { colors } = validateThemeColors({ ...input }, 'dark')

    expect(colors.error).toBe(input.error)
    expect(colors.warning).toBe(input.warning)
  })
})

describe('describeIssue', () => {
  test('produces an actionable sentence for every issue kind', () => {
    const { issues } = validateThemeColors(
      {
        text: 'rgb(30,30,30)',
        error: 'not-a-colour',
        warning: 'rgb(255,90,70)',
        success: 'rgb(253,94,74)',
      },
      'dark',
    )

    expect(issues.length).toBeGreaterThan(0)
    for (const issue of issues) {
      const text = describeIssue(issue)
      expect(text.length).toBeGreaterThan(20)
      expect(text).not.toContain('undefined')
    }
  })
})

describe('the shipped themes are reference data, not inputs', () => {
  test('built-in dark would pass the readable-slot floors', () => {
    // Not a requirement — built-ins never go through the validator — but if
    // this ever fails it means the floors drifted above what Anthropic itself
    // ships, which would be hard to justify for user themes.
    const dark = getTheme('dark') as unknown as Record<string, string>
    const { issues } = validateThemeColors({ ...dark }, 'dark')

    expect(issues.filter(i => i.kind === 'unparseable')).toEqual([])
  })
})
