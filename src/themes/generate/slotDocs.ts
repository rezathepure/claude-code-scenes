/**
 * What every theme slot means, written for the model rather than for us.
 *
 * This file is the single biggest lever on generated-theme quality. A slot the
 * model misunderstands produces a theme that is subtly wrong in a way no
 * amount of contrast validation can catch — `background` is the sharpest
 * example: it sounds like a backdrop and is actually the status colour for
 * backgrounded tasks. A model told only its name will reliably paint it as a
 * page background.
 *
 * Detailed descriptions are given for the slots that carry meaning. Purely
 * decorative families (subagent hues, the ultrathink rainbow) get a shared
 * instruction instead, which keeps the prompt affordable without giving up
 * anything that matters.
 */

export type SlotDoc = {
  slot: string
  /** What the user actually sees. Written as a sentence the model can act on. */
  describes: string
  /** Optional constraint the model would otherwise get wrong. */
  caution?: string
}

/** Slots whose meaning changes how the theme reads. */
export const KEY_SLOT_DOCS: readonly SlotDoc[] = [
  // --- identity -----------------------------------------------------------
  {
    slot: 'claude',
    describes:
      'The primary accent. Brand wordmark, spinner, and the colour the theme is remembered by. This is the theme’s signature.',
  },
  {
    slot: 'claudeShimmer',
    describes:
      'A lighter version of `claude`, cycled through during the loading shimmer.',
    caution:
      'Must be visibly lighter than `claude` or the shimmer animation looks like a flicker.',
  },
  {
    slot: 'promptBorder',
    describes: 'The horizontal rule under the input box at the bottom.',
  },
  {
    slot: 'promptBorderShimmer',
    describes: 'Lighter `promptBorder`, used while the prompt is animating.',
  },

  // --- text ---------------------------------------------------------------
  {
    slot: 'text',
    describes:
      'Body text. Whole paragraphs of assistant output are read in this colour.',
    caution:
      'The single most important slot for legibility. Keep it close to the extreme — near-white on a dark theme, near-black on a light one.',
  },
  {
    slot: 'inverseText',
    describes:
      'Text drawn on top of a highlighted or inverted block, not on the terminal background.',
    caution:
      'Must contrast with the *highlight*, so on a dark theme this is usually dark — the opposite of `text`.',
  },
  {
    slot: 'inactive',
    describes:
      'Dimmed secondary text: timestamps, tool output, hints. Very widely used.',
    caution:
      'Should read as clearly quieter than `text` while staying comfortably legible.',
  },
  {
    slot: 'inactiveShimmer',
    describes: 'Lighter `inactive`, for shimmering dim text.',
  },
  {
    slot: 'subtle',
    describes:
      'The faintest decorative text: separators and structural punctuation.',
    caution:
      'Deliberately low contrast. This is the one slot where being hard to read is correct.',
  },
  {
    slot: 'suggestion',
    describes: 'Autocomplete and inline suggestions offered to the user.',
  },
  {
    slot: 'remember',
    describes: 'Memory notices — text saved to CLAUDE.md and similar.',
  },

  // --- semantic -----------------------------------------------------------
  {
    slot: 'success',
    describes: 'A command or operation succeeded.',
  },
  {
    slot: 'error',
    describes: 'Something failed. Errors, rejections, aborted work.',
    caution:
      'Must be clearly distinguishable from `warning` at a glance — a failure must never read as a caution.',
  },
  {
    slot: 'warning',
    describes: 'A caution the user should notice but that is not a failure.',
  },
  {
    slot: 'warningShimmer',
    describes: 'Lighter `warning`, for shimmering warning text.',
  },
  {
    slot: 'merged',
    describes: 'A merged pull request or applied change.',
  },
  {
    slot: 'background',
    describes:
      'The status colour for tasks running in the BACKGROUND — it sits alongside success, error and warning as a task state.',
    caution:
      'Despite the name this is NOT a page or terminal background. It is a foreground status colour and must be readable as text.',
  },

  // --- modes --------------------------------------------------------------
  {
    slot: 'autoAccept',
    describes: 'The indicator shown while auto-accept edits mode is on.',
  },
  { slot: 'planMode', describes: 'The indicator shown while in plan mode.' },
  {
    slot: 'permission',
    describes:
      'Accent for permission prompts asking the user to approve a tool.',
  },
  {
    slot: 'permissionShimmer',
    describes: 'Lighter `permission`, for the shimmer on permission prompts.',
  },
  {
    slot: 'bashBorder',
    describes:
      'Accent for bash mode, shown when the user prefixes input with `!`.',
  },
  { slot: 'ide', describes: 'Indicator for a connected IDE.' },
  { slot: 'fastMode', describes: 'Indicator shown while fast mode is on.' },
  { slot: 'fastModeShimmer', describes: 'Lighter `fastMode`.' },

  // --- diffs --------------------------------------------------------------
  {
    slot: 'diffAdded',
    describes:
      'The BACKGROUND FILL behind an added line in a diff. Text is drawn on top of it.',
    caution:
      'A quiet wash, not a signal colour. It must be dim enough that `text` stays readable over it. Conventionally green-tinted.',
  },
  {
    slot: 'diffRemoved',
    describes:
      'The BACKGROUND FILL behind a removed line. Text is drawn on top of it.',
    caution:
      'Also a quiet wash. Conventionally red-tinted. Being a background, it does not compete with `error`, which is bright foreground text.',
  },
  {
    slot: 'diffAddedDimmed',
    describes: 'A fainter `diffAdded`, used for context lines.',
  },
  {
    slot: 'diffRemovedDimmed',
    describes: 'A fainter `diffRemoved`, used for context lines.',
  },
  {
    slot: 'diffAddedWord',
    describes:
      'Word-level highlight inside an added line, marking exactly what changed.',
    caution: 'Stronger than `diffAdded` so it stands out against it.',
  },
  {
    slot: 'diffRemovedWord',
    describes: 'Word-level highlight inside a removed line.',
    caution: 'Stronger than `diffRemoved`.',
  },

  // --- surfaces -----------------------------------------------------------
  {
    slot: 'userMessageBackground',
    describes: 'Background fill behind the user’s own messages.',
    caution: 'Very close to the terminal background — a hint, not a block.',
  },
  {
    slot: 'userMessageBackgroundHover',
    describes: 'Slightly lifted `userMessageBackground` on hover.',
  },
  {
    slot: 'selectionBg',
    describes: 'Background behind text the user has selected with the mouse.',
  },
  {
    slot: 'bashMessageBackgroundColor',
    describes: 'Background fill behind bash command blocks.',
  },
  {
    slot: 'memoryBackgroundColor',
    describes: 'Background fill behind memory notices.',
  },
]

/**
 * Families where only the collective behaviour matters. Described in one line
 * each rather than spending prompt budget on 22 near-identical entries.
 */
export const SLOT_FAMILIES: ReadonlyArray<{
  prefixOrNames: readonly string[]
  instruction: string
}> = [
  {
    prefixOrNames: ['_FOR_SUBAGENTS_ONLY'],
    instruction:
      'Eight colours used to tell parallel subagents apart. Keep the given hue names roughly honest (red-ish, blue-ish, …), pull them toward the theme’s palette, and make sure all eight stay distinguishable from one another.',
  },
  {
    prefixOrNames: ['rainbow_'],
    instruction:
      'A seven-colour spectrum (plus lighter `_shimmer` twins) used to highlight extended-thinking keywords. Keep it recognisably a spectrum, tinted toward the theme.',
  },
  {
    prefixOrNames: ['clawd_'],
    instruction:
      'The two colours of the small ASCII mascot: its body and the space behind it.',
  },
  {
    prefixOrNames: ['rate_limit_'],
    instruction:
      'The filled and empty halves of a usage meter. `fill` should read as active, `empty` as inert.',
  },
  {
    prefixOrNames: ['briefLabel'],
    instruction:
      'Two labels distinguishing the user from Claude in summaries. They must be tellable apart.',
  },
  {
    prefixOrNames: [
      'professionalBlue',
      'chromeYellow',
      'messageActionsBackground',
      'claudeBlue_FOR_SYSTEM_SPINNER',
      'claudeBlueShimmer_FOR_SYSTEM_SPINNER',
    ],
    instruction:
      'Minor accents used in narrow contexts. Keep them on-theme; exact values matter little.',
  },
]

/** The house style both reference themes follow, stated for the model. */
export const THEME_DISCIPLINE = [
  'Pick one hue as the theme’s signature and let it carry `claude`, `promptBorder` and `permission` together, so the theme reads as one idea rather than a collection of colours.',
  'Give tools and suggestions a cooler, contrasting accent, so tool output separates from prose at a glance.',
  'Spend exactly one warm hue on cost and highlights. One deliberate break from the main hue is striking; three is noise.',
  'Reserve red for genuine failure. If red also means "removed line" or "highlight", a real error stops registering.',
  'Every `*Shimmer` slot must be a lighter twin of the slot it shadows, or animations flicker instead of shimmer.',
] as const
