// @[MODEL LAUNCH]: Update these if the family's positioning changes.
/**
 * The one-line description shown against each model family.
 *
 * Kept in one place because the same sentence appears in the picker rows, the
 * "Default (recommended)" row and the status line, and they drifted apart every
 * time a launch touched only some of them. Wording is official Claude Code's,
 * verbatim, so the two clients read identically.
 *
 * This module is a leaf on purpose: model.ts and modelOptions.ts both import it
 * and modelOptions.ts already imports model.ts.
 */

export const OPUS_TAGLINE = 'Best for everyday, complex tasks'
export const SONNET_TAGLINE = 'Efficient for routine tasks'
export const HAIKU_TAGLINE = 'Fastest for quick answers'
export const FABLE_TAGLINE =
  'Most capable for your hardest and longest-running tasks'
