/**
 * Every model we ship must have a price.
 *
 * `modelCost.test.ts` deliberately re-implements its helpers locally to dodge
 * the import chain, which is exactly why Opus 4.7 shipped for two releases with
 * no `MODEL_COSTS` entry: every request fired `tengu_unknown_model_cost` and
 * fell through to the default tier, which happened to be the right price. A
 * silently-correct fallback is not coverage.
 *
 * This file imports the real table and asserts it against the real registry, so
 * registering a model without pricing it fails here rather than in someone's
 * `/cost` output.
 */

import { describe, expect, test } from 'bun:test'
import { CANONICAL_MODEL_IDS } from 'src/utils/model/configs.js'
import { firstPartyNameToCanonical } from 'src/utils/model/model.js'
import { MODEL_COSTS } from 'src/utils/modelCost.js'

describe('MODEL_COSTS', () => {
  test('prices every model in ALL_MODEL_CONFIGS', () => {
    const missing = CANONICAL_MODEL_IDS.filter(
      id => MODEL_COSTS[firstPartyNameToCanonical(id)] === undefined,
    )
    expect(missing).toEqual([])
  })

  test('has one entry per registered model — no canonical-key collisions', () => {
    // MODEL_COSTS keys are computed via firstPartyNameToCanonical(). If two
    // configs canonicalise to the same string (as claude-opus-5 and
    // claude-opus-4-8 both did before the canonical fix), the object literal
    // silently drops one: no TS error, no runtime error, one wrong price.
    const canonical = CANONICAL_MODEL_IDS.map(firstPartyNameToCanonical)
    expect(new Set(canonical).size).toBe(canonical.length)
  })

  test('quotes prices in dollars per Mtok, not per token', () => {
    // Guards a fat-fingered decimal: the cheapest model is $0.80/Mtok input
    // and the dearest is $75/Mtok output, so anything outside this range is a
    // unit error rather than a new pricing tier.
    for (const id of CANONICAL_MODEL_IDS) {
      const costs = MODEL_COSTS[firstPartyNameToCanonical(id)]
      expect({
        id,
        ok: costs.inputTokens >= 0.1 && costs.inputTokens <= 100,
      }).toEqual({ id, ok: true })
      expect({
        id,
        ok: costs.outputTokens >= 0.1 && costs.outputTokens <= 500,
      }).toEqual({ id, ok: true })
    }
  })
})
