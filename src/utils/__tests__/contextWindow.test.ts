/**
 * Context-window and max-output resolution across the model generations.
 *
 * Two silent-failure modes are pinned here.
 *
 * The Claude 5 generation is 1M natively — no `[1m]` opt-in. Sizing it at the
 * 200K default would make the context meter read five times too high and fire
 * autocompact around 180K on a model that could take a million tokens. Nothing
 * would error; sessions would just get quietly worse.
 *
 * And `claude-opus-4-8` satisfies `.includes('opus-4')`, so it lands in the
 * Opus 4 arm of every substring ladder unless it has its own arm above them —
 * which would cap its output at 32K instead of 128K.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getContextWindowForModel,
  getModelMaxOutputTokens,
  modelSupports1M,
} from 'src/utils/context.js'

const ONE_MILLION = 1_000_000
const TWO_HUNDRED_K = 200_000

/**
 * Point CLAUDE_CONFIG_DIR at an empty directory for the duration of the file.
 *
 * getContextWindowForModel consults the `/v1/models` capability cache at
 * ~/.claude/cache/model-capabilities.json *before* it falls back to any
 * hardcoded knowledge. On a developer machine that cache is usually populated,
 * so these assertions would pass whether or not the code under test works —
 * and then fail on CI, where the cache does not exist. Reading the real one
 * makes this a test of the developer's home directory.
 *
 * getClaudeConfigHomeDir is memoized on CLAUDE_CONFIG_DIR, so setting it here
 * takes effect without needing to reset anything.
 */
let savedConfigDir: string | undefined
beforeAll(() => {
  savedConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'ccs-ctx-'))
})
afterAll(() => {
  if (savedConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = savedConfigDir
  }
})

describe('getContextWindowForModel', () => {
  test('gives the Claude 5 generation 1M without a [1m] suffix', () => {
    expect(getContextWindowForModel('claude-opus-5')).toBe(ONE_MILLION)
    expect(getContextWindowForModel('claude-sonnet-5')).toBe(ONE_MILLION)
    expect(getContextWindowForModel('claude-fable-5')).toBe(ONE_MILLION)
  })

  test('still honours an explicit [1m] suffix on older models', () => {
    expect(getContextWindowForModel('claude-opus-4-7[1m]')).toBe(ONE_MILLION)
  })

  test('leaves Haiku 4.5 at 200K', () => {
    // Haiku is 200K in official's catalogue and must not be swept up by the
    // native-1M set.
    expect(getContextWindowForModel('claude-haiku-4-5-20251001')).toBe(
      TWO_HUNDRED_K,
    )
  })

  test('CLAUDE_CODE_DISABLE_1M_CONTEXT caps the native-1M models too', () => {
    const saved = process.env.CLAUDE_CODE_DISABLE_1M_CONTEXT
    process.env.CLAUDE_CODE_DISABLE_1M_CONTEXT = '1'
    try {
      expect(getContextWindowForModel('claude-opus-5')).toBe(TWO_HUNDRED_K)
    } finally {
      if (saved === undefined) {
        delete process.env.CLAUDE_CODE_DISABLE_1M_CONTEXT
      } else {
        process.env.CLAUDE_CODE_DISABLE_1M_CONTEXT = saved
      }
    }
  })
})

describe('modelSupports1M', () => {
  test('covers the Claude 5 generation and Opus 4.6 through 4.8', () => {
    for (const model of [
      'claude-opus-5',
      'claude-sonnet-5',
      'claude-fable-5',
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-opus-4-6',
    ]) {
      expect({ model, supported: modelSupports1M(model) }).toEqual({
        model,
        supported: true,
      })
    }
  })

  test('excludes Haiku, which has no 1M variant', () => {
    expect(modelSupports1M('claude-haiku-4-5-20251001')).toBe(false)
  })
})

describe('getModelMaxOutputTokens', () => {
  test('gives Opus 5 and Fable 5 a 128K ceiling', () => {
    expect(getModelMaxOutputTokens('claude-opus-5')).toEqual({
      default: 64_000,
      upperLimit: 128_000,
    })
    expect(getModelMaxOutputTokens('claude-fable-5')).toEqual({
      default: 64_000,
      upperLimit: 128_000,
    })
  })

  test('gives Sonnet 5 a 128K ceiling at the Sonnet default', () => {
    expect(getModelMaxOutputTokens('claude-sonnet-5')).toEqual({
      default: 32_000,
      upperLimit: 128_000,
    })
  })

  test('does not let Opus 4.8 fall into the Opus 4 arm', () => {
    // The Opus 4 arm is 32K/32K. Landing there truncates output at a quarter
    // of the real ceiling, with no error to explain why.
    expect(getModelMaxOutputTokens('claude-opus-4-8')).toEqual({
      default: 64_000,
      upperLimit: 128_000,
    })
  })

  test('leaves Haiku 4.5 at 64K', () => {
    expect(getModelMaxOutputTokens('claude-haiku-4-5-20251001')).toEqual({
      default: 32_000,
      upperLimit: 64_000,
    })
  })
})
