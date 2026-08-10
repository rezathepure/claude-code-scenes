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

  test('installing the package runs nothing at all', () => {
    // The README and the landing page both state this outright. Keep them true.
    //
    // ripgrep used to arrive via postinstall; it is vendored into the tarball
    // at publish time instead. `prepare` used to install husky's git hooks;
    // that moved to `bun run hooks`, which contributors run once. npm skips
    // `prepare` for registry installs anyway, but "npm happens not to run it"
    // is a weaker guarantee than not declaring it, and this is the list npm
    // reads to decide whether to warn.
    const install = [
      'preinstall',
      'install',
      'postinstall',
      'prepare',
      'prepublish',
    ]
    for (const name of install) {
      expect(manifest.scripts[name]).toBeUndefined()
    }
  })

  test('the ripgrep binaries are not excluded from the tarball', () => {
    // A stray negation here ships a package whose search tools cannot run,
    // and npm reports no error — the files simply are not there.
    expect(manifest.files).toContain('dist')
    expect(manifest.files.some((f: string) => f.startsWith('!'))).toBe(false)
  })
})
