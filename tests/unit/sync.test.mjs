import test from "node:test"
import assert from "node:assert/strict"
import { syncProviderUsage } from "../../lib/ingestion/sync.ts"

const record = (id) => ({
  providerRequestId: id,
  model: "model",
  occurredAt: "2026-09-17T12:00:00Z",
  inputTokens: 1,
  outputTokens: 1,
})
const adapter = (pages, valid = true) => ({
  provider: "openai",
  capabilities: {},
  validateCredential: async () => {
    if (!valid) throw new Error("invalid")
  },
  fetchUsage: async ({ cursor }) => pages[cursor ?? "first"],
  normalizeUsage: (value) => ({
    ...value,
    provider: "openai",
    ingestionSource: "provider_poll",
    idempotencyKey: "openai:" + value.providerRequestId,
    costStatus: "unknown",
  }),
})
const context = { workspaceId: "workspace", environment: "development" }
const deps = () => {
  const checkpoints = []
  return {
    checkpoints,
    loadCheckpoint: async () => checkpoints.at(-1) ?? null,
    saveCheckpoint: async (checkpoint) => checkpoints.push(checkpoint),
    ingestPage: async (events) => ({ inserted: events.length }),
  }
}

test("syncs pages, normalizes records, ingests, and advances checkpoints", async () => {
  const pages = {
    first: {
      records: [record("a")],
      nextCursor: "next",
      windowEnd: "2026-09-17T13:00:00Z",
    },
    next: { records: [record("b")], windowEnd: "2026-09-17T14:00:00Z" },
  }
  const dependencies = deps()
  const result = await syncProviderUsage(
    adapter(pages),
    context,
    { start: "2026-09-17T00:00:00Z", end: "2026-09-18T00:00:00Z" },
    dependencies
  )
  assert.deepEqual(result, {
    pages: 2,
    events: 2,
    inserted: 2,
    windowEnd: "2026-09-17T14:00:00Z",
  })
  assert.deepEqual(dependencies.checkpoints, [
    {
      cursor: "next",
      windowStart: "2026-09-17T00:00:00Z",
      windowEnd: "2026-09-17T13:00:00Z",
    },
    {
      cursor: null,
      windowStart: "2026-09-17T00:00:00Z",
      windowEnd: "2026-09-17T14:00:00Z",
    },
  ])
})

test("resumes from a saved cursor", async () => {
  const pages = {
    saved: { records: [record("b")], windowEnd: "2026-09-17T14:00:00Z" },
  }
  const dependencies = deps()
  dependencies.checkpoints.push({
    cursor: "saved",
    windowStart: "2026-09-17T00:00:00Z",
    windowEnd: "2026-09-18T00:00:00Z",
  })
  const result = await syncProviderUsage(
    adapter(pages),
    context,
    { start: "2026-09-17T00:00:00Z", end: "2026-09-18T00:00:00Z" },
    dependencies
  )
  assert.equal(result.events, 1)
})

test("does not reuse a cursor from another window", async () => {
  const pages = {
    first: { records: [record("new")], windowEnd: "2026-09-18T14:00:00Z" },
    stale: { records: [record("stale")], windowEnd: "2026-09-18T14:00:00Z" },
  }
  const dependencies = deps()
  dependencies.checkpoints.push({
    cursor: "stale",
    windowStart: "old",
    windowEnd: "old",
  })
  const result = await syncProviderUsage(
    adapter(pages),
    context,
    { start: "2026-09-18T00:00:00Z", end: "2026-09-19T00:00:00Z" },
    dependencies
  )
  assert.equal(result.events, 1)
  assert.equal(dependencies.checkpoints.at(-1).cursor, null)
})

test("applies pricing before ingestion when a pricing stage is supplied", async () => {
  let received
  const dependencies = {
    ...deps(),
    priceEvent: (value) => ({
      ...value,
      cost: 1.25,
      currency: "USD",
      costStatus: "estimated",
    }),
    ingestPage: async (events) => {
      received = events
      return { inserted: events.length }
    },
  }
  await syncProviderUsage(
    adapter({ first: { records: [record("priced")], windowEnd: "end" } }),
    context,
    { start: "start", end: "end" },
    dependencies
  )
  assert.equal(received[0].cost, 1.25)
  assert.equal(received[0].costStatus, "estimated")
})

test("does not advance a checkpoint when fetch or ingest fails", async () => {
  const checkpoints = []
  const dependencies = {
    loadCheckpoint: async () => null,
    saveCheckpoint: async (value) => checkpoints.push(value),
    ingestPage: async () => {
      throw new Error("write failed")
    },
  }
  await assert.rejects(
    syncProviderUsage(
      adapter({ first: { records: [record("a")], windowEnd: "end" } }),
      context,
      { start: "start", end: "end" },
      dependencies
    ),
    /write failed/
  )
  assert.equal(checkpoints.length, 0)
})

test("validates credentials before making a usage request", async () => {
  let requested = false
  const invalid = adapter({}, false)
  invalid.fetchUsage = async () => {
    requested = true
    throw new Error("should not fetch")
  }
  await assert.rejects(
    syncProviderUsage(invalid, context, { start: "start", end: "end" }, deps()),
    /invalid/
  )
  assert.equal(requested, false)
})

test("bounds runaway pagination", async () => {
  const pages = {
    first: { records: [], nextCursor: "again", windowEnd: "end" },
    again: { records: [], nextCursor: "again", windowEnd: "end" },
  }
  await assert.rejects(
    syncProviderUsage(
      adapter(pages),
      context,
      { start: "start", end: "end" },
      deps(),
      2
    ),
    /page limit/
  )
})
