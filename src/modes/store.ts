import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { useSyncExternalStore } from 'react'
import { parse as parseYaml } from 'yaml'
import {
  getInitialSettings,
  getSettingsForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { DEFAULT_MODES } from './defaults.js'
import type { Mode } from './types.js'

/** Where the chosen mode is persisted in settings.json. */
const MODE_SETTING_KEY = 'ccsMode'

/**
 * What that key was called when this was upstream's code. Still read, never
 * written: a user who picked a mode before the rename would otherwise be
 * silently dropped back to 'default' on upgrade, with nothing to explain it.
 */
const LEGACY_MODE_SETTING_KEY = 'ccbMode'

let currentModeSlug: string | null = null
let customModes: Mode[] | null = null
const modeListeners = new Set<() => void>()

/**
 * Converts a human-readable name to a URL-safe slug.
 * @example kebabCase('Claude Persona') → 'claude-persona'
 */
function kebabCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Extracts YAML frontmatter and Markdown body from a string.
 * Expects the format used by Claude Code SKILL.md, OpenCode agents,
 * and Cursor rules: `---` delimited YAML followed by Markdown content.
 *
 * @throws {Error} If the string does not contain valid `---` delimiters.
 * @returns The parsed frontmatter object and the body text.
 */
function parseMarkdownFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>
  body: string
} {
  const parts = raw.split(/^---$/m)
  if (parts.length < 3) {
    throw new Error('Invalid markdown frontmatter: missing --- delimiters')
  }
  return {
    frontmatter: parseYaml(parts[1]) as Record<string, unknown>,
    body: parts.slice(2).join('---').trim(),
  }
}

function loadCustomModes(): Mode[] {
  if (customModes !== null) return customModes
  customModes = []
  try {
    const modesDir = join(getClaudeConfigHomeDir(), 'modes')
    if (!existsSync(modesDir)) {
      mkdirSync(modesDir, { recursive: true })
    }
    const files = readdirSync(modesDir).filter(
      f => f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.md'),
    )
    for (const file of files) {
      try {
        const raw = readFileSync(join(modesDir, file), 'utf-8')
        let data: Record<string, unknown>
        if (file.endsWith('.md')) {
          const { frontmatter, body } = parseMarkdownFrontmatter(raw)
          data = { ...frontmatter, system_prompt: body }
          if (!data.slug) {
            data.slug = data.name ? kebabCase(String(data.name)) : ''
          }
          data.icon = data.icon || '🤖'
        } else {
          data = parseYaml(raw) as Record<string, unknown>
        }
        if (!data.slug || !data.name) continue
        customModes.push({
          name: String(data.name),
          slug: String(data.slug),
          description: String(data.description || ''),
          icon: String(data.icon || '🔧'),
          systemPrompt: String(data.system_prompt || ''),
          model: data.model ? String(data.model) : undefined,
          ui: {
            accentColor: String(
              (data.ui as Record<string, unknown>)?.accent_color || '#00D4AA',
            ),
            promptPrefix: String(
              (data.ui as Record<string, unknown>)?.prompt_prefix || '',
            ),
          },
          permissions: {
            defaultMode:
              ((data.permissions as Record<string, unknown>)
                ?.default_mode as Mode['permissions']['defaultMode']) ||
              'default',
            memoryExtract: Boolean(
              (data.permissions as Record<string, unknown>)?.memory_extract ??
                true,
            ),
          },
          responseStyle: {
            verbosity:
              ((data.response_style as Record<string, unknown>)
                ?.verbosity as Mode['responseStyle']['verbosity']) || 'normal',
          },
        })
      } catch {
        // skip invalid yaml or markdown files
      }
    }
  } catch {
    // modes directory may not exist
  }
  return customModes
}

function getAllModes(): Mode[] {
  const custom = loadCustomModes()
  if (custom.length === 0) return DEFAULT_MODES
  // Custom modes override defaults with same slug
  const slugs = new Set(custom.map(m => m.slug))
  return [...custom, ...DEFAULT_MODES.filter(m => !slugs.has(m.slug))]
}

/**
 * Picks the mode slug out of a settings object, preferring the current key and
 * falling back to the pre-rename one.
 *
 * Split out from `getCurrentModeSlug` because that memoizes for the process
 * lifetime, which makes it awkward to test more than one settings shape.
 */
export function resolveModeSlug(settings: Record<string, unknown>): string {
  const stored = settings[MODE_SETTING_KEY] ?? settings[LEGACY_MODE_SETTING_KEY]
  return (typeof stored === 'string' ? stored : '') || 'default'
}

export function getCurrentModeSlug(): string {
  if (currentModeSlug === null) {
    // Merged across sources, so a project-level choice still wins — reading
    // only userSettings here would change existing behaviour. The legacy key
    // is the fallback, which keeps a pre-rename choice working even on a
    // machine where the migration below has not run (or could not write).
    currentModeSlug = resolveModeSlug(
      getInitialSettings() as Record<string, unknown>,
    )
  }
  return currentModeSlug
}

/**
 * Moves a pre-rename `ccbMode` in the user's settings.json over to `ccsMode`,
 * then removes the old key.
 *
 * Only ever touches userSettings. A `ccbMode` coming from project or policy
 * settings is left alone — those are not ours to rewrite, and the read above
 * still honours them.
 *
 * Idempotent, and never clobbers: if both keys are present the newer one wins
 * and the legacy key is simply dropped. Runs from init, so it is a one-time
 * cost on the first launch after upgrading and a no-op on every launch after.
 */
export function migrateLegacyModeSetting(): void {
  const userSettings = getSettingsForSource('userSettings') as
    | Record<string, unknown>
    | undefined
  const legacy = userSettings?.[LEGACY_MODE_SETTING_KEY]
  if (typeof legacy !== 'string') return

  const alreadyMigrated = typeof userSettings?.[MODE_SETTING_KEY] === 'string'
  updateSettingsForSource('userSettings', {
    ...(alreadyMigrated ? {} : { [MODE_SETTING_KEY]: legacy }),
    // updateSettingsForSource treats undefined as deletion.
    [LEGACY_MODE_SETTING_KEY]: undefined,
  } as Record<string, unknown>)
}

export function getCurrentMode(): Mode {
  const slug = getCurrentModeSlug()
  const modes = getAllModes()
  return modes.find(m => m.slug === slug) ?? DEFAULT_MODES[0]
}

export function setCurrentMode(slug: string): void {
  const modes = getAllModes()
  const mode = modes.find(m => m.slug === slug)
  if (!mode) {
    throw new Error(
      `Unknown mode: ${slug}. Available: ${modes.map(m => m.slug).join(', ')}`,
    )
  }
  currentModeSlug = slug
  updateSettingsForSource('userSettings', {
    [MODE_SETTING_KEY]: slug,
  } as Record<string, unknown>)
  for (const listener of modeListeners) listener()
}

function subscribeMode(listener: () => void): () => void {
  modeListeners.add(listener)
  return () => modeListeners.delete(listener)
}

/** Reactive hook — re-renders the component when the mode changes. */
export function useCurrentMode(): Mode {
  return useSyncExternalStore(subscribeMode, getCurrentMode)
}

export function listModes(): Mode[] {
  return getAllModes()
}

export function cycleMode(): Mode {
  const modes = listModes()
  const current = getCurrentModeSlug()
  const idx = modes.findIndex(m => m.slug === current)
  const next = modes[(idx + 1) % modes.length]
  setCurrentMode(next.slug)
  return next
}
