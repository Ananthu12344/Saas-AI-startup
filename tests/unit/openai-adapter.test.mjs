import test from "node:test"
import assert from "node:assert/strict"
import { OpenAIAdapter } from "../../lib/providers/openai.ts"

test("OpenAI adapter exposes only declared telemetry capabilities", () => {
  const adapter = new OpenAIAdapter(
    async () => ({ records: [], windowEnd: "2026-09-17T13:00:00Z" }),
    async () => undefined
  )
  assert.equal(adapter.provider, "openai")
  assert.equal(adapter.capabilities.accountUsage, true)
  assert.equal(adapter.capabilities.requestIds, true)
  assert.equal(adapter.capabilities.modelPricing, false)
})

test("validates credentials before polling and forwards the cursor", async () => {
  let validated = false
  let requested
  const adapter = new OpenAIAdapter(
    async (window) => {
      requested = window
      return { records: [], windowEnd: "2026-09-17T13:00:00Z" }
    },
    async () => {
      validated = true
    }
  )
  await adapter.validateCredential()
  await adapter.fetchUsage({ start: "start", end: "end", cursor: "next" })
  assert.equal(validated, true)
  assert.deepEqual(requested, { start: "start", end: "end", cursor: "next" })
})

test("normalizes provider request IDs into stable ingestion keys", () => {
  const adapter = new OpenAIAdapter(
    async () => ({ records: [], windowEnd: "2026-09-17T13:00:00Z" }),
    async () => undefined
  )
  const withRequestId = adapter.normalizeUsage({
    providerRequestId: "req-1",
    model: "gpt",
    occurredAt: "2026-09-17T12:00:00Z",
    inputTokens: 2,
    outputTokens: 3,
  })
  const withoutRequestId = adapter.normalizeUsage({
    model: "gpt",
    occurredAt: "2026-09-17T12:00:00Z",
    inputTokens: 2,
    outputTokens: 3,
  })
  assert.equal(withRequestId.idempotencyKey, "openai:req-1")
  assert.equal(
    withoutRequestId.idempotencyKey,
    "openai:gpt:2026-09-17T12:00:00Z:2:3"
  )
  assert.equal(withRequestId.costStatus, "unknown")
})

test("preserves provider costs and optional telemetry", () => {
  const adapter = new OpenAIAdapter(
    async () => ({ records: [], windowEnd: "2026-09-17T13:00:00Z" }),
    async () => undefined
  )
  const normalized = adapter.normalizeUsage({
    providerRequestId: "req-2",
    model: "gpt",
    occurredAt: "2026-09-17T12:00:00Z",
    inputTokens: 2,
    outputTokens: 3,
    cachedInputTokens: 1,
    reasoningTokens: 4,
    cost: 0.2,
    currency: "USD",
    status: "succeeded",
    latencyMs: 40,
    metadata: { endpoint: "/usage" },
  })
  assert.equal(normalized.costStatus, "actual")
  assert.equal(normalized.cachedInputTokens, 1)
  assert.equal(normalized.reasoningTokens, 4)
  assert.equal(normalized.status, "succeeded")
})
