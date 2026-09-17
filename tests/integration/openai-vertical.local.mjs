import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { OpenAIAdapter } from "../../lib/providers/openai.ts"
import { createCheckpointStore } from "../../lib/ingestion/checkpoints.ts"
import { ingestUsagePage } from "../../lib/ingestion/ingest.ts"
import { syncProviderUsage } from "../../lib/ingestion/sync.ts"
import { applyPricing, selectPricingVersion } from "../../lib/usage/pricing.ts"
import { loadPricingVersions } from "../../lib/usage/pricing-repository.ts"

const env = {
  ...process.env,
  DOCKER_HOST: "unix://" + process.env.HOME + "/.colima/default/docker.sock",
}
const config = JSON.parse(
  execFileSync("./node_modules/.bin/supabase", ["status", "-o", "json"], {
    env,
    encoding: "utf8",
  })
)
assert.equal(new URL(config.API_URL).hostname, "127.0.0.1")
const supabase = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const workspaceId = "10000000-0000-0000-0000-0000000000a1"
const runId = "openai-vertical-" + randomUUID()
const credentialId = randomUUID()
const providerModelId = randomUUID()
const records = [
  {
    providerRequestId: runId + "-1",
    model: "gpt-4o-mini",
    occurredAt: "2026-09-17T10:00:00Z",
    inputTokens: 1_000_000,
    outputTokens: 100_000,
  },
  {
    providerRequestId: runId + "-2",
    model: "gpt-4o-mini",
    occurredAt: "2026-09-17T11:00:00Z",
    inputTokens: 500_000,
    outputTokens: 50_000,
  },
]
const pages = {
  first: {
    records: [records[0]],
    nextCursor: "page-2",
    windowEnd: "2026-09-17T12:00:00Z",
  },
  "page-2": { records: [records[1]], windowEnd: "2026-09-17T13:00:00Z" },
}
const adapter = new OpenAIAdapter(
  async (window) => pages[window.cursor ?? "first"],
  async () => undefined
)
const { data: provider, error: providerError } = await supabase
  .from("ai_providers")
  .select("id")
  .eq("slug", "openai")
  .single()
assert.equal(providerError, null)
const { error: credentialError } = await supabase
  .from("api_credentials")
  .insert({
    id: credentialId,
    workspace_id: workspaceId,
    provider_id: provider.id,
    label: runId,
    created_by: "00000000-0000-0000-0000-0000000000a1",
    metadata: { purpose: "local-test" },
  })
assert.equal(credentialError, null)
const { error: modelError } = await supabase.from("provider_models").insert({
  id: providerModelId,
  provider_id: provider.id,
  provider_model: "gpt-4o-mini",
  display_name: "Local GPT-4o mini",
})
assert.equal(modelError, null)
const { error: pricingError } = await supabase
  .from("model_pricing_versions")
  .insert({
    provider_model_id: providerModelId,
    effective_from: "2026-01-01T00:00:00Z",
    currency: "USD",
    input_cost_per_million: 2,
    output_cost_per_million: 8,
    source: "local-test",
  })
assert.equal(pricingError, null)
const pricing = await loadPricingVersions(supabase, "openai", "gpt-4o-mini")
assert.equal(pricing.length, 1)
const context = { workspaceId, environment: "development" }
const checkpointStore = createCheckpointStore(supabase, {
  workspaceId,
  providerId: provider.id,
  credentialId,
})
const dependencies = {
  ...checkpointStore,
  priceEvent: (event) =>
    applyPricing(event, selectPricingVersion(pricing, event.occurredAt)),
  ingestPage: (events, pageContext) =>
    ingestUsagePage(supabase, "openai", events, pageContext),
}

try {
  const first = await syncProviderUsage(
    adapter,
    context,
    { start: "2026-09-17T00:00:00Z", end: "2026-09-18T00:00:00Z" },
    dependencies
  )
  const replay = await syncProviderUsage(
    adapter,
    context,
    { start: "2026-09-17T00:00:00Z", end: "2026-09-18T00:00:00Z" },
    dependencies
  )
  assert.deepEqual(first, {
    pages: 2,
    events: 2,
    inserted: 2,
    windowEnd: "2026-09-17T13:00:00Z",
  })
  assert.equal(replay.inserted, 0)
  const { data: events, error: eventError } = await supabase
    .from("usage_events")
    .select("cost,cost_status,provider_request_id")
    .eq("workspace_id", workspaceId)
    .like("provider_request_id", runId + "%")
    .order("provider_request_id")
  assert.equal(eventError, null)
  assert.equal(events.length, 2)
  assert.equal(events[0].cost_status, "estimated")
  assert.ok(Math.abs(Number(events[0].cost) - 2.8) < 1e-9)
  assert.ok(Math.abs(Number(events[1].cost) - 1.4) < 1e-9)
  const { data: aggregate, error: aggregateError } = await supabase
    .from("usage_cost_by_model")
    .select("total_cost,total_tokens")
    .eq("workspace_id", workspaceId)
    .eq("model", "gpt-4o-mini")
  assert.equal(aggregateError, null)
  assert.ok(
    aggregate.some(
      (row) =>
        Number(row.total_cost) >= 4.2 - 1e-9 &&
        Number(row.total_tokens) >= 1_650_000
    )
  )
  console.log(
    "PASS OpenAI-shaped vertical pipeline: sync, pricing, idempotency, aggregation"
  )
} finally {
  await supabase
    .from("usage_events")
    .delete()
    .eq("workspace_id", workspaceId)
    .like("provider_request_id", runId + "%")
  await supabase
    .from("ingestion_checkpoints")
    .delete()
    .eq("credential_id", credentialId)
  await supabase.from("api_credentials").delete().eq("id", credentialId)
  await supabase
    .from("model_pricing_versions")
    .delete()
    .eq("provider_model_id", providerModelId)
  await supabase.from("provider_models").delete().eq("id", providerModelId)
}
