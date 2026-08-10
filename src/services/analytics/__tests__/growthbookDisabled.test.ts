import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

// No mocking: this asserts on the env-var contract that decides whether a
// client is ever constructed. Mocking the module would test the mock.
const SAVED = {
  url: process.env.CLAUDE_GB_ADAPTER_URL,
  key: process.env.CLAUDE_GB_ADAPTER_KEY,
}

function restore(
  name: 'CLAUDE_GB_ADAPTER_URL' | 'CLAUDE_GB_ADAPTER_KEY',
  value: string | undefined,
): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

beforeEach(() => {
  delete process.env.CLAUDE_GB_ADAPTER_URL
  delete process.env.CLAUDE_GB_ADAPTER_KEY
})

afterEach(() => {
  restore('CLAUDE_GB_ADAPTER_URL', SAVED.url)
  restore('CLAUDE_GB_ADAPTER_KEY', SAVED.key)
})

/**
 * Mirrors isGrowthBookEnabled() in ../growthbook.ts, which is module-private.
 * Kept in step by the source assertion below rather than by hope.
 */
function isEnabled(): boolean {
  return Boolean(
    process.env.CLAUDE_GB_ADAPTER_URL && process.env.CLAUDE_GB_ADAPTER_KEY,
  )
}

describe('GrowthBook is off unless you point it somewhere yourself', () => {
  test('no adapter configured means no client, so no request', () => {
    // Upstream fetched flags from api.anthropic.com on every launch, carrying
    // a device id, session id and — once signed in — account email and UUIDs.
    // Nothing in this fork should reach the network for feature flags.
    expect(isEnabled()).toBe(false)
  })

  test('half a configuration is not a configuration', () => {
    process.env.CLAUDE_GB_ADAPTER_URL = 'https://flags.example.com'
    expect(isEnabled()).toBe(false)
    delete process.env.CLAUDE_GB_ADAPTER_URL

    process.env.CLAUDE_GB_ADAPTER_KEY = 'sdk-whatever'
    expect(isEnabled()).toBe(false)
  })

  test('both set turns it on, for a server you control', () => {
    process.env.CLAUDE_GB_ADAPTER_URL = 'https://flags.example.com'
    process.env.CLAUDE_GB_ADAPTER_KEY = 'sdk-whatever'
    expect(isEnabled()).toBe(true)
  })

  test('the real switch has not drifted from the one asserted here', async () => {
    // The regression that matters is someone restoring the old body — which
    // fell back to is1PEventLoggingEnabled() and phoned home by default.
    const src = await Bun.file('src/services/analytics/growthbook.ts').text()
    const body = src.slice(src.indexOf('function isGrowthBookEnabled'))
    const firstReturn = body.slice(0, body.indexOf('}\n'))
    expect(firstReturn).toContain('CLAUDE_GB_ADAPTER_URL')
    expect(firstReturn).toContain('CLAUDE_GB_ADAPTER_KEY')
    expect(firstReturn).not.toContain('is1PEventLoggingEnabled')
  })
})
