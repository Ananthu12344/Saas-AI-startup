import test from "node:test"
import assert from "node:assert/strict"
import { applyPricing, selectPricingVersion } from "../../lib/usage/pricing.ts"

const base = {
  provider: "openai",
  model: "gpt-test",
  occurredAt: "2026-09-17T12:00:00Z",
  inputTokens: 1_000_000,
  outputTokens: 500_000,
  cachedInputTokens: 200_000,
  reasoningTokens: 100_000,
  ingestionSource: "provider_poll",
  idempotencyKey: "price-test",
  costStatus: "unknown",
}
const older = {
  providerModelId: "model",
  effectiveFrom: "2026-01-01T00:00:00Z",
  effectiveTo: "2026-07-01T00:00:00Z",
  currency: "USD",
  inputCostPerMillion: 1,
  outputCostPerMillion: 2,
}
const current = {
  providerModelId: "model",
  effectiveFrom: "2026-07-01T00:00:00Z",
  currency: "USD",
  inputCostPerMillion: 3,
  outputCostPerMillion: 4,
  cachedInputCostPerMillion: 1,
  reasoningCostPerMillion: 5,
}

test("selects effective historical price and open-ended current price", () => {
  assert.equal(
    selectPricingVersion([older, current], "2026-06-30T23:59:59Z"),
    older
  )
  assert.equal(
    selectPricingVersion([older, current], "2026-09-17T00:00:00Z"),
    current
  )
  assert.equal(
    selectPricingVersion([older, current], "2025-12-31T23:59:59Z"),
    undefined
  )
})

test("rejects overlapping effective pricing versions", () => {
  assert.throws(
    () =>
      selectPricingVersion(
        [current, { ...current, effectiveFrom: "2026-08-01T00:00:00Z" }],
        "2026-09-17T00:00:00Z"
      ),
    /Overlapping/
  )
})

test("prices uncosted usage with cached and reasoning rates", () => {
  const priced = applyPricing(base, current)
  // 800k * $3 + 200k * $1 + 500k * $4 + 100k * $5, per million.
  assert.ok(Math.abs(priced.cost - 5.1) < 1e-9)
  assert.equal(priced.currency, "USD")
  assert.equal(priced.costStatus, "estimated")
})

test("preserves provider-reported actual cost", () => {
  const actual = applyPricing(
    { ...base, cost: 2.5, currency: "USD", costStatus: "actual" },
    current
  )
  assert.equal(actual.cost, 2.5)
  assert.equal(actual.costStatus, "actual")
})

test("marks missing pricing unknown", () => {
  const priced = applyPricing(base, undefined)
  assert.equal(priced.cost, undefined)
  assert.equal(priced.costStatus, "unknown")
})
