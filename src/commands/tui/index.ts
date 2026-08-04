import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import {
  getTuiMarkerPath,
  getTuiPreference,
  isTuiModeEnabled,
  setTuiPreference,
} from '../../utils/tuiMode.js'
import type { Command, LocalCommandResult } from '../../types/command.js'

export { getTuiMarkerPath, isTuiModeEnabled }

const USAGE_TEXT = [
  'Usage: /tui [subcommand]',
  '',
  '  (no args)   Toggle flicker-free TUI mode (alternate screen buffer)',
  '  on          Enable TUI mode',
  '  off         Disable TUI mode',
  '  status      Show current TUI mode state',
  '',
  'TUI mode uses the ANSI alternate screen buffer (\\x1b[?1049h) so the',
  'Claude Code UI occupies a clean full-screen area with no scroll-back',
  'flicker.  It is ON by default, and it is what animated themes need in',
  'order to paint — see `/theme`.  The setting is stored in',
  '~/.claude/.tui-mode and takes effect on the next session start.',
  '',
  'Environment override:',
  '  CLAUDE_CODE_NO_FLICKER=1   force on (overrides the stored setting)',
  '  CLAUDE_CODE_NO_FLICKER=0   force off (overrides the stored setting)',
].join('\n')

/** Shared tail: the setting cannot apply to the session already rendering. */
const RESTART_NOTE = 'Takes effect on the next session start.'

function enableTui(): LocalCommandResult {
  setTuiPreference('on')
  return {
    type: 'text',
    value: [
      '## TUI mode enabled',
      '',
      'Flicker-free alternate-screen rendering, and the backdrop for animated',
      'themes.',
      '',
      RESTART_NOTE,
      '',
      'To disable: `/tui off`',
    ].join('\n'),
  }
}

function disableTui(): LocalCommandResult {
  setTuiPreference('off')
  return {
    type: 'text',
    value: [
      '## TUI mode disabled',
      '',
      'Standard (non-alternate-screen) rendering will be used. Animated theme',
      'backdrops cannot paint in this mode — themes still apply their colours.',
      '',
      RESTART_NOTE,
      '',
      'To re-enable: `/tui on`',
    ].join('\n'),
  }
}

export async function callTui(args: string): Promise<LocalCommandResult> {
  const sub = args.trim().toLowerCase()

  // ── status ──────────────────────────────────────────────────────────
  if (sub === 'status') {
    const preference = getTuiPreference()
    const envVal = process.env.CLAUDE_CODE_NO_FLICKER
    let envLine: string
    if (envVal === '1' || envVal === 'true') {
      envLine = 'CLAUDE_CODE_NO_FLICKER=1 (forced on via env var)'
    } else if (envVal === '0' || envVal === 'false') {
      envLine = 'CLAUDE_CODE_NO_FLICKER=0 (forced off via env var)'
    } else {
      envLine = 'CLAUDE_CODE_NO_FLICKER not set'
    }
    const storedLine =
      preference === 'unset'
        ? 'not set — defaults to enabled'
        : `${preference} (\`${getTuiMarkerPath()}\`)`
    return {
      type: 'text',
      value: [
        '## TUI Mode Status',
        '',
        `  Stored setting:  ${storedLine}`,
        `  Env var:         ${envLine}`,
        `  Effective:       ${isTuiModeEnabled() ? 'enabled' : 'disabled'}`,
        '',
        `Note: ${RESTART_NOTE.toLowerCase()}`,
      ].join('\n'),
    }
  }

  // ── on ───────────────────────────────────────────────────────────────
  if (sub === 'on') {
    return enableTui()
  }

  // ── off ──────────────────────────────────────────────────────────────
  if (sub === 'off') {
    return disableTui()
  }

  // ── toggle (legacy default) ──────────────────────────────────────────
  if (sub === '' || sub === 'toggle') {
    return isTuiModeEnabled() ? disableTui() : enableTui()
  }

  // ── unknown subcommand ───────────────────────────────────────────────
  return {
    type: 'text',
    value: [`Unknown subcommand: "${sub}"`, '', USAGE_TEXT].join('\n'),
  }
}

const tuiCommand: Command = {
  type: 'local-jsx',
  name: 'tui',
  description:
    'Manage flicker-free TUI mode. Open actions or run: status, on, off, toggle',
  isHidden: false,
  isEnabled: () => !getIsNonInteractiveSession(),
  argumentHint: '[status|on|off|toggle]',
  bridgeSafe: true,
  getBridgeInvocationError: args =>
    args.trim()
      ? undefined
      : 'Use /tui status/on/off/toggle over Remote Control.',
  load: () => import('./panel.js'),
}

export const tuiNonInteractive: Command = {
  type: 'local',
  name: 'tui',
  description:
    'Toggle flicker-free TUI mode (alternate screen buffer). Subcommands: on, off, status',
  isHidden: false,
  isEnabled: () => getIsNonInteractiveSession(),
  supportsNonInteractive: true,
  bridgeSafe: true,
  load: async () => ({
    call: callTui,
  }),
}

export default tuiCommand
