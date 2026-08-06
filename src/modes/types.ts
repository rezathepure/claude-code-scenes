import type { PermissionMode } from '../types/permissions.js'

/**
 * A named personality preset: system prompt, accent colour, verbosity,
 * permission default, optionally a model. Six ship in `defaults.ts` and users
 * can add their own as YAML or Markdown in `~/.claude/modes/`.
 *
 * Called `CCBMode` when this was upstream's code. Renamed to plain `Mode`
 * rather than `CCSMode` — a two-letter product acronym in a type name is the
 * thing that made the old one unreadable, and this lives in `src/modes/`.
 */
export interface Mode {
  name: string
  slug: string
  description: string
  icon: string
  systemPrompt: string
  model?: string
  ui: {
    accentColor: string
    promptPrefix: string
  }
  companionSpecies?: string
  permissions: {
    defaultMode: PermissionMode
    memoryExtract: boolean
  }
  responseStyle: {
    verbosity: 'minimal' | 'normal' | 'verbose'
  }
}
