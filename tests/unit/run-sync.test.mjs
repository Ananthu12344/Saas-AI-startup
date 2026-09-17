import assert from "node:assert/strict"
import test from "node:test"
import { runProviderSync } from "../../lib/ingestion/run.ts"

test("composes checkpoint, pricing, and ingestion dependencies", async () => {
  const calls = []
  const supabase = {
    from(table) {
      assert.ok(
        ["ingestion_checkpoints", "ai_providers", "usage_events"].includes(
          table
        )
      )
      return {
        select() {
          return this
        },
        match() {
          return this
        },
        eq() {
          return this
        },
        order() {
          return this
        },
        async maybeSingle() {
          return table === "ingestion_checkpoints"
            ? { data: null, error: null }
            : { data: { id: "provider-id" }, error: null }
        },
        async single() {
          return { data: { id: "provider-id" }, error: null }
        },
        upsert(values) {
          calls.push({ table, operation: "upsert", values })
          if (table === "usage_events")
            return {
              async select() {
                return { data: [], error: null }
              },
            }
          return Promise.resolve({ error: null })
        },
        async insert() {
          return { error: null }
        },
      }
    },
  }
  const adapter = {
    provider: "openai",
    capabilities: {
      accountUsage: true,
      projectUsage: false,
      requestIds: true,
      cachedTokens: false,
      reasoningTokens: false,
      historicalUsage: true,
      modelPricing: false,
    },
    async validateCredential() {},
    async fetchUsage() {
      return {
        records: [
          {
            model: "model-a",
            occurredAt: "2026-09-17T12:00:00Z",
            inputTokens: 1_000_000,
            outputTokens: 0,
          },
        ],
        windowEnd: "2026-09-17T13:00:00Z",
      }
    },
    normalizeUsage(record) {
      return {
        ...record,
        provider: "openai",
        ingestionSource: "provider_poll",
        idempotencyKey: "openai:model-a:1",
        costStatus: "unknown",
      }
    },
  }
  const result = await runProviderSync({
    supabase,
    adapter,
    provider: "openai",
    providerId: "provider-id",
    credentialId: "credential-id",
    context: { workspaceId: "workspace-id", environment: "development" },
    window: { start: "2026-09-17T00:00:00Z", end: "2026-09-18T00:00:00Z" },
    pricingByModel: {
      "model-a": [
        {
          providerModelId: "model-id",
          effectiveFrom: "2026-01-01T00:00:00Z",
          currency: "USD",
          inputCostPerMillion: 2,
          outputCostPerMillion: 8,
        },
      ],
    },
  })
  assert.deepEqual(result, {
    pages: 1,
    events: 1,
    inserted: 0,
    windowEnd: "2026-09-17T13:00:00Z",
  })
  assert.equal(calls.length, 2)
  assert.ok(calls.some((call) => call.table === "ingestion_checkpoints"))
  assert.ok(calls.some((call) => call.table === "usage_events"))
})
