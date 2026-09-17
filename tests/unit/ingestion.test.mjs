import test from "node:test"
import assert from "node:assert/strict"
import {
  buildUsageEventRow,
  sanitizeUsageMetadata,
} from "../../lib/ingestion/ingest.ts"

const event = (overrides = {}) => ({
  provider: "openai",
  model: "gpt-test",
  occurredAt: "2026-09-17T12:00:00Z",
  inputTokens: 100,
  outputTokens: 20,
  cost: 0.42,
  currency: "USD",
  ingestionSource: "provider_poll",
  idempotencyKey: "openai:req-1",
  costStatus: "actual",
  ...overrides,
})

const context = { workspaceId: "workspace-a", environment: "development" }

test("maps normalized usage to the immutable usage-event shape", () => {
  const row = buildUsageEventRow(
    event({ metadata: { endpoint: "/usage", prompt: "private" } }),
    context,
    "provider-id"
  )
  assert.deepEqual(row, {
    workspace_id: "workspace-a",
    project_id: null,
    application_id: null,
    provider_id: "provider-id",
    credential_id: null,
    model: "gpt-test",
    input_tokens: 100,
    output_tokens: 20,
    cached_input_tokens: 0,
    reasoning_tokens: 0,
    cost: 0.42,
    currency: "USD",
    cost_status: "actual",
    provider_request_id: null,
    idempotency_key: "openai:req-1",
    ingestion_source: "provider_poll",
    request_status: "unknown",
    latency_ms: null,
    environment: "development",
    occurred_at: "2026-09-17T12:00:00.000Z",
    request_metadata: { endpoint: "/usage" },
  })
})

test("sanitizes sensitive metadata and bounds nesting", () => {
  assert.deepEqual(
    sanitizeUsageMetadata({
      authorization: "secret",
      messages: ["prompt"],
      safe: { value: true },
    }),
    { safe: { value: true } }
  )
})

for (const [name, override] of [
  ["negative tokens", { inputTokens: -1 }],
  ["fractional tokens", { outputTokens: 1.2 }],
  ["invalid cost", { cost: -1 }],
  ["invalid currency", { currency: "US" }],
  ["invalid timestamp", { occurredAt: "not-a-date" }],
])
  test("rejects " + name, () =>
    assert.throws(() =>
      buildUsageEventRow(event(override), context, "provider-id")
    )
  )

test("rejects oversized metadata", () =>
  assert.throws(
    () => sanitizeUsageMetadata({ detail: "x".repeat(17_000) }),
    /16 KB/
  ))
