import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { ingestUsagePage } from "../../lib/ingestion/ingest.ts"

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
const key = "local-ingestion-" + randomUUID()
const workspaceId = "10000000-0000-0000-0000-0000000000a1"
const event = {
  provider: "openai",
  model: "gpt-4o-mini",
  occurredAt: "2026-09-17T16:00:00Z",
  inputTokens: 120,
  outputTokens: 30,
  cost: 0.01,
  currency: "USD",
  providerRequestId: "local-request-" + randomUUID(),
  ingestionSource: "provider_poll",
  idempotencyKey: key,
  costStatus: "actual",
  metadata: { endpoint: "/usage", prompt: "must not be stored" },
}

try {
  const context = { workspaceId, environment: "development" }
  const first = await ingestUsagePage(supabase, "openai", [event], context)
  const replay = await ingestUsagePage(supabase, "openai", [event], context)
  assert.equal(first.inserted, 1)
  assert.equal(replay.inserted, 0)
  const { data, error } = await supabase
    .from("usage_events")
    .select("id,request_metadata")
    .eq("workspace_id", workspaceId)
    .eq("idempotency_key", key)
    .eq("ingestion_source", "provider_poll")
  assert.equal(error, null)
  assert.equal(data.length, 1)
  assert.deepEqual(data[0].request_metadata, { endpoint: "/usage" })
  console.log("PASS local ingestion is idempotent and metadata-minimized")
} finally {
  await supabase
    .from("usage_events")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("idempotency_key", key)
    .eq("ingestion_source", "provider_poll")
}
