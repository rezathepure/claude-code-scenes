/**
 * What each theme slot is *for*, which decides how it gets validated.
 *
 * The naive rule — "every colour must contrast with the background" — is
 * wrong here twice over:
 *
 *  1. There is no background slot to contrast against. `theme.background` is
 *     a cyan status colour for *backgrounded tasks* (see taskStatusUtils.tsx,
 *     which returns it alongside 'success' | 'error' | 'warning'), not a
 *     backdrop. A terminal app never paints one; text lands on whatever
 *     background the user's terminal has.
 *
 *  2. Many slots are never read as text. `diffAdded` and `diffRemoved` are
 *     line *fills* — StructuredDiff/Fallback.tsx passes them to
 *     `backgroundColor` and draws text on top — so they are deliberately
 *     faint. Measured against a terminal background they sit at 1.3-2.2 in
 *     every shipped theme, and demanding contrast from them would mean
 *     "fixing" colours that are correct.
 *
 * So only a small, explicit set of slots is contrast-checked. Everything else
 * is checked for being a parseable colour and otherwise left alone. An
 * allowlist is used rather than an attempt to classify all 71 slots, because
 * a mistake in the allowlist means a colour goes unchecked, whereas a mistake
 * in a denylist means a correct colour gets mangled.
 */

/**
 * Terminal backgrounds to validate against, standing in for the real thing.
 *
 * Deliberately a little harder than the extremes: most dark terminals are
 * nearer #1e1e1e than pure black, and a theme that only works on #000 will
 * disappoint. Same in reverse for light.
 */
export const ASSUMED_TERMINAL_BACKGROUND = {
  dark: { r: 24, g: 24, b: 24 },
  light: { r: 245, g: 245, b: 245 },
} as const

/**
 * Sustained reading text. This is the one slot holding whole paragraphs, so
 * it gets the accessibility-grade bar rather than the loose one.
 *
 * For reference, every shipped theme clears this comfortably — the worst is
 * 17.76:1 — as do both reference themes (Matrix 16.79, Sakura 16.84).
 */
export const BODY_TEXT_SLOT = 'text'
export const BODY_TEXT_FLOOR = 4.5

/**
 * Short semantic labels: status words, hints, dimmed secondary text.
 *
 * These get the loose floor. Calibration: across the shipped themes these
 * slots bottom out at 4.04 (`suggestion` in light), and the reference themes
 * at 5.10 (Matrix `inactive`) and 5.91 (Sakura `error`) — so a floor of 2.5
 * leaves every hand-designed theme completely untouched and only intervenes
 * on text that is genuinely close to invisible.
 *
 * The floor is deliberately *below* the shipped themes' own worst cases
 * (`claude` 1.95 and `warning` 1.96 in light-daltonized). Holding generated
 * themes to a stricter bar than Anthropic's own shipped palettes would be
 * hard to justify, and would sand the character off exactly the moody themes
 * this feature exists to allow.
 */
export const SEMANTIC_TEXT_SLOTS = [
  'inactive',
  'error',
  'warning',
  'success',
  'suggestion',
  'remember',
  'merged',
] as const
export const SEMANTIC_TEXT_FLOOR = 2.5

/**
 * Groups whose members must be tellable apart from one another.
 *
 * Contrast alone cannot catch this: two colours can each read beautifully
 * against the background and still be indistinguishable from each other, at
 * which point a failed command looks exactly like a warning.
 *
 * Measured in Oklab. Reference themes sit at 0.157 (Matrix error/warning) and
 * 0.159 (Sakura), and the shipped themes bottom out at 0.138, so a threshold
 * of 0.05 is comfortably clear of every real theme while still catching
 * genuinely-collided colours.
 */
export const DISTINCT_GROUPS: ReadonlyArray<{
  readonly slots: readonly string[]
  readonly why: string
}> = [
  {
    slots: ['error', 'warning', 'success'],
    why: 'a failed command must not look like a warning or a success',
  },
  {
    slots: ['text', 'inactive'],
    why: 'dimmed text must be distinguishable from normal text',
  },
  {
    slots: ['diffAdded', 'diffRemoved'],
    why: 'added and removed lines must not look alike',
  },
]
export const DISTINCTNESS_FLOOR = 0.05

/**
 * Slots that are background fills, listed so validation can say *why* it is
 * skipping them rather than appearing to have forgotten.
 *
 * Not exhaustive of every unchecked slot — it documents the ones a reader
 * would most expect to be contrast-checked.
 */
export const BACKGROUND_FILL_SLOTS = [
  'diffAdded',
  'diffRemoved',
  'diffAddedDimmed',
  'diffRemovedDimmed',
  'userMessageBackground',
  'userMessageBackgroundHover',
  'messageActionsBackground',
  'selectionBg',
  'bashMessageBackgroundColor',
  'memoryBackgroundColor',
  'clawd_background',
] as const
