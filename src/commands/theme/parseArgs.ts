/**
 * Parses the argument string given to `/theme`.
 *
 * Two forms:
 *   /theme                        open the picker (existing behaviour)
 *   /theme create <description>   generate a theme from a description
 *
 * Splits on the first space and keeps the remainder verbatim, following
 * src/commands/skill-store/parseArgs.ts. Deliberately *not* `split(/\s+/)` —
 * the description is prose, and collapsing its whitespace would quietly change
 * what the user asked for.
 */

export type ParsedThemeCommand =
  | { kind: 'picker' }
  | { kind: 'create'; description: string }
  | { kind: 'export'; source: string }
  | { kind: 'delete'; name: string }
  | { kind: 'restore'; name: string }
  | { kind: 'error'; message: string }

/**
 * Derives a filename-safe theme name from a description.
 *
 * Themes are keyed by filename, so this has to produce something valid on
 * every filesystem: lowercase, alphanumeric and dashes only. Keeps the first
 * few words so `"a moody vampire castle"` becomes `moody-vampire-castle`
 * rather than an opaque hash.
 */
export function themeNameFromDescription(description: string): string {
  const STOP_WORDS = new Set([
    'a',
    'an',
    'the',
    'for',
    'me',
    'my',
    'like',
    'theme',
    'make',
    'create',
    'as',
    'of',
    'with',
    'in',
    'to',
  ])

  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0 && !STOP_WORDS.has(w))

  const name = words.slice(0, 3).join('-').slice(0, 40)

  // Everything was stop words or punctuation; fall back to something valid
  // rather than producing an empty filename.
  return name.length > 0 ? name : 'custom-theme'
}

export function parseThemeArgs(args: string): ParsedThemeCommand {
  const trimmed = args.trim()
  if (trimmed.length === 0) {
    return { kind: 'picker' }
  }

  const spaceIdx = trimmed.indexOf(' ')
  const subCmd = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)
  const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim()

  switch (subCmd.toLowerCase()) {
    case 'create':
      if (rest.length === 0) {
        return {
          kind: 'error',
          message:
            'Describe the theme you want, for example: /theme create a moody vampire castle',
        }
      }
      return { kind: 'create', description: rest }

    case 'export':
      if (rest.length === 0) {
        return {
          kind: 'error',
          message:
            'Name a theme to copy, for example: /theme export dark — this writes an editable copy you can start from.',
        }
      }
      return { kind: 'export', source: rest }

    case 'delete':
      if (rest.length === 0) {
        return {
          kind: 'error',
          message: 'Name the theme to delete, for example: /theme delete eee',
        }
      }
      return { kind: 'delete', name: rest }

    case 'restore':
      if (rest.length === 0) {
        return {
          kind: 'error',
          message:
            'Name the theme to restore, for example: /theme restore matrix — this brings back a theme that ships with ccs.',
        }
      }
      return { kind: 'restore', name: rest }

    default:
      return {
        kind: 'error',
        message: `Unknown option "${subCmd}". Use "/theme" to pick one, "/theme create <description>" to generate one, "/theme export <name>" to copy one for editing, or "/theme delete <name>" to remove one. A theme that ships with ccs comes back with "/theme restore <name>".`,
      }
  }
}
