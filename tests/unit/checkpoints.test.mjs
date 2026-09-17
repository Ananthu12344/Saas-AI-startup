import assert from "node:assert/strict"
import test from "node:test"
import { createCheckpointStore } from "../../lib/ingestion/checkpoints.ts"

function fakeSupabase({ row = null, loadError = null, saveError = null } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      assert.equal(table, "ingestion_checkpoints")
      return {
        select(columns) {
          assert.equal(columns, "cursor,window_start,window_end")
          return {
            match(values) {
              calls.push({ operation: "load", values })
              return {
                async maybeSingle() {
                  return { data: row, error: loadError }
                },
              }
            },
          }
        },
        async upsert(values, options) {
          calls.push({ operation: "save", values, options })
          return { error: saveError }
        },
      }
    },
  }
}

test("loads a persisted checkpoint for the exact identity", async () => {
  const supabase = fakeSupabase({
    row: {
      cursor: "page-2",
      window_start: "2026-09-17T00:00:00Z",
      window_end: "2026-09-17T12:00:00Z",
    },
  })
  const store = createCheckpointStore(supabase, {
    workspaceId: "workspace",
    providerId: "provider",
    credentialId: "credential",
  })
  assert.deepEqual(await store.loadCheckpoint(), {
    cursor: "page-2",
    windowStart: "2026-09-17T00:00:00Z",
    windowEnd: "2026-09-17T12:00:00Z",
  })
  assert.deepEqual(supabase.calls[0], {
    operation: "load",
    values: {
      workspace_id: "workspace",
      provider_id: "provider",
      credential_id: "credential",
    },
  })
})

test("upserts one checkpoint and clears stale errors", async () => {
  const supabase = fakeSupabase()
  const store = createCheckpointStore(supabase, {
    workspaceId: "workspace",
    providerId: "provider",
    credentialId: "credential",
  })
  await store.saveCheckpoint({
    cursor: null,
    windowStart: "2026-09-17T00:00:00Z",
    windowEnd: "2026-09-17T13:00:00Z",
  })
  const call = supabase.calls[0]
  assert.equal(call.operation, "save")
  assert.deepEqual(call.options, {
    onConflict: "workspace_id,provider_id,credential_id",
  })
  assert.deepEqual(
    { ...call.values, last_success_at: "timestamp", last_error: null },
    {
      workspace_id: "workspace",
      provider_id: "provider",
      credential_id: "credential",
      cursor: null,
      window_start: "2026-09-17T00:00:00Z",
      window_end: "2026-09-17T13:00:00Z",
      last_success_at: "timestamp",
      last_error: null,
    }
  )
  assert.match(call.values.last_success_at, /^\d{4}-\d{2}-\d{2}T/)
})

test("hides database errors behind worker-safe messages", async () => {
  const loadStore = createCheckpointStore(
    fakeSupabase({ loadError: new Error("secret database detail") }),
    { workspaceId: "w", providerId: "p", credentialId: "c" }
  )
  await assert.rejects(loadStore.loadCheckpoint(), {
    message: "Unable to load ingestion checkpoint",
  })

  const saveStore = createCheckpointStore(
    fakeSupabase({ saveError: new Error("secret database detail") }),
    { workspaceId: "w", providerId: "p", credentialId: "c" }
  )
  await assert.rejects(saveStore.saveCheckpoint({}), {
    message: "Unable to save ingestion checkpoint",
  })
})
