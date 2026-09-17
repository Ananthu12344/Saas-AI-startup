import assert from "node:assert/strict"
import test from "node:test"
import { loadPricingVersions } from "../../lib/usage/pricing-repository.ts"

function fakeSupabase({
  provider = { id: "provider-id" },
  model = { id: "model-id" },
  prices = [],
  error = null,
} = {}) {
  return {
    from(table) {
      const state = { table, filters: [] }
      return {
        select() {
          return this
        },
        eq(column, value) {
          state.filters.push({ column, value })
          return this
        },
        order() {
          return this
        },
        async maybeSingle() {
          if (state.table === "ai_providers") return { data: provider, error }
          return { data: model, error }
        },
        then(resolve) {
          return resolve({ data: prices, error })
        },
      }
    },
  }
}

test("loads and converts effective-dated pricing rows", async () => {
  const versions = await loadPricingVersions(
    fakeSupabase({
      prices: [
        {
          effective_from: "2026-01-01T00:00:00Z",
          effective_to: null,
          currency: "USD",
          input_cost_per_million: "2.5",
          output_cost_per_million: "8",
          cached_input_cost_per_million: "1",
          reasoning_cost_per_million: null,
        },
      ],
    }),
    "openai",
    "gpt-test"
  )
  assert.deepEqual(versions, [
    {
      providerModelId: "model-id",
      effectiveFrom: "2026-01-01T00:00:00Z",
      effectiveTo: null,
      currency: "USD",
      inputCostPerMillion: 2.5,
      outputCostPerMillion: 8,
      cachedInputCostPerMillion: 1,
      reasoningCostPerMillion: null,
    },
  ])
})

test("returns no prices for unknown provider models", async () => {
  assert.deepEqual(
    await loadPricingVersions(
      fakeSupabase({ model: null }),
      "openai",
      "missing"
    ),
    []
  )
})

test("rejects malformed pricing values", async () => {
  await assert.rejects(
    loadPricingVersions(
      fakeSupabase({
        prices: [
          {
            effective_from: "2026-01-01T00:00:00Z",
            effective_to: null,
            currency: "USD",
            input_cost_per_million: "NaN",
            output_cost_per_million: "8",
            cached_input_cost_per_million: null,
            reasoning_cost_per_million: null,
          },
        ],
      }),
      "openai",
      "gpt-test"
    ),
    { message: "Invalid pricing input rate" }
  )
})
