#!/usr/bin/env node

/**
 * Unified Chrome MCP setup script.
 *
 * Usage:
 *   node scripts/setup-chrome-mcp.mjs           # Run full setup (fix-permissions → register → doctor)
 *   node scripts/setup-chrome-mcp.mjs doctor    # Run a single sub-command
 *
 * ## Opt-in, not opt-out
 *
 * This registers a Chrome *native-messaging host* — it writes a manifest into
 * the user's browser profile granting a local binary the right to talk to the
 * browser. That is a reasonable thing to want, and an unreasonable thing to do
 * to someone who typed `npm i -g` for a terminal theme.
 *
 * So it runs only when asked: set CLAUDE_CODE_SETUP_CHROME_MCP=1, or invoke
 * this script directly with a sub-command. The old opt-out variable is still
 * honoured so existing CI and Dockerfiles that set it keep working.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

const userArgs = process.argv.slice(2)
const invokedDirectly = userArgs.length > 0

if (!invokedDirectly) {
  if (process.env.CLAUDE_CODE_SKIP_POSTINSTALL === '1') process.exit(0)
  // Retired opt-out, still honoured so nobody's existing config breaks.
  if (process.env.CLAUDE_CODE_SKIP_CHROME_MCP_SETUP === '1') process.exit(0)
  if (process.env.CLAUDE_CODE_SETUP_CHROME_MCP !== '1') process.exit(0)
}

const require = createRequire(import.meta.url)
const cliPath = require.resolve(
  '@claude-code-best/mcp-chrome-bridge/dist/cli.js',
)

function getChromeMcpLogDir() {
  const home = homedir()
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Logs', 'mcp-chrome-bridge')
  }
  if (process.platform === 'win32') {
    return join(
      process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'),
      'mcp-chrome-bridge',
      'logs',
    )
  }
  return join(
    process.env.XDG_STATE_HOME || join(home, '.local', 'state'),
    'mcp-chrome-bridge',
    'logs',
  )
}

if (invokedDirectly) {
  // Forward single sub-command. Errors surface as-is: the user ran this on
  // purpose and wants to see what went wrong.
  execFileSync('node', [cliPath, ...userArgs], { stdio: 'inherit' })
} else {
  // Full setup sequence
  const steps = [
    ['fix-permissions'],
    ['register', '--browser', 'chrome'],
    ['doctor'],
  ]

  try {
    mkdirSync(getChromeMcpLogDir(), { recursive: true })

    for (let i = 0; i < steps.length; i++) {
      const args = steps[i]
      const isLast = i === steps.length - 1
      if (isLast) console.log(`\n[${i + 1}/${steps.length}] ${args.join(' ')}`)
      execFileSync('node', [cliPath, ...args], {
        stdio: isLast ? 'inherit' : 'pipe',
      })
    }

    console.log('\nChrome MCP setup complete!')
  } catch (error) {
    // One line, not a stack trace. This runs during `npm install`, where a
    // wall of Node internals reads as a broken install even though the CLI
    // itself is fine — Chrome integration simply is not available.
    console.warn(
      `[chrome-mcp] setup skipped: ${error?.message ?? error}\n` +
        '[chrome-mcp] the CLI works without it; rerun with ' +
        'CLAUDE_CODE_SETUP_CHROME_MCP=1 once Chrome is installed.',
    )
  }
}
