import { describe, expect, test } from 'bun:test'

/**
 * Reads package.json rather than mocking anything: the thing under test is what
 * npm executes on a stranger's machine, and that is a fact about the manifest.
 */
const manifest = await Bun.file('package.json').json()

describe('nothing touches the browser at install time', () => {
  test('the Chrome MCP bridge is not a dependency', () => {
    // Its own postinstall writes com.chromemcp.nativehost.json into the Chrome
    // profile — a native-messaging manifest granting a local binary the right
    // to talk to the browser — on every `npm i -g`, with no way to decline.
    // Nothing in src/ or packages/ ever used it: this fork's Chrome support is
    // src/utils/claudeInChrome/, which registers its own host at runtime and
    // only when asked. Upstream keeps the dependency; a merge must not.
    const every = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    }
    expect(Object.keys(every)).not.toContain(
      '@claude-code-best/mcp-chrome-bridge',
    )
  })

  test('postinstall downloads ripgrep and does nothing else', () => {
    // The README and the landing page both state this outright. Keep them true.
    expect(manifest.scripts.postinstall).toBe('node scripts/postinstall.cjs')
  })

  test('no other lifecycle script runs on install', () => {
    for (const name of ['preinstall', 'install', 'prepublish']) {
      expect(manifest.scripts[name]).toBeUndefined()
    }
  })
})
