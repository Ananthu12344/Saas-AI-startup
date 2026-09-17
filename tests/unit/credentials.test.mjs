import assert from "node:assert/strict"
import test from "node:test"
import { resolveProviderApiKey } from "../../lib/providers/credentials.ts"

function fakeSupabase({ row = null, loadError = null } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      assert.equal(table, "api_credential_secrets")
      return {
        select(columns) {
          assert.equal(columns, "secret_ref,secret_ciphertext,key_version")
          return {
            eq(column, value) {
              assert.equal(column, "credential_id")
              calls.push({ column, value })
              return {
                async maybeSingle() {
                  return { data: row, error: loadError }
                },
              }
            },
          }
        },
      }
    },
  }
}

test("loads only isolated credential material and delegates decryption", async () => {
  const supabase = fakeSupabase({
    row: {
      secret_ref: "vault://credential/1",
      secret_ciphertext: "ciphertext",
      key_version: "v1",
    },
  })
  let received
  const key = await resolveProviderApiKey(
    supabase,
    "credential-id",
    async (record) => {
      received = record
      return "api-key"
    }
  )
  assert.equal(key, "api-key")
  assert.equal(received.secret_ciphertext, "ciphertext")
  assert.deepEqual(supabase.calls, [
    { column: "credential_id", value: "credential-id" },
  ])
})

test("rejects missing or empty credentials without leaking details", async () => {
  await assert.rejects(
    resolveProviderApiKey(fakeSupabase(), "credential-id", async () => "key"),
    { message: "Provider credential is unavailable" }
  )
  await assert.rejects(
    resolveProviderApiKey(
      fakeSupabase({ row: { secret_ref: "", secret_ciphertext: null } }),
      "credential-id",
      async () => "key"
    ),
    { message: "Provider credential is empty" }
  )
})

test("normalizes decrypt failures and rejects blank plaintext", async () => {
  const row = {
    secret_ref: "vault://credential/1",
    secret_ciphertext: "cipher",
  }
  await assert.rejects(
    resolveProviderApiKey(fakeSupabase({ row }), "credential-id", async () => {
      throw new Error("key material")
    }),
    { message: "Unable to decrypt provider credential" }
  )
  await assert.rejects(
    resolveProviderApiKey(
      fakeSupabase({ row }),
      "credential-id",
      async () => "  "
    ),
    { message: "Provider credential is empty" }
  )
})
