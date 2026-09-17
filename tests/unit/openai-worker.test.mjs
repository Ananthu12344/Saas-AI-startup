import assert from "node:assert/strict"
import test from "node:test"
import { createCredentialDecryptor, encryptProviderCredential } from "../../lib/providers/crypto.ts"
import { createOpenAIAdapterForCredential } from "../../lib/providers/openai-worker.ts"

const config = { key: Buffer.alloc(32, 4), keyVersion: "v1" }

function fakeSupabase(row) {
  return {
    from(table) {
      assert.equal(table, "api_credential_secrets")
      return {
        select(columns) {
          assert.equal(columns, "secret_ref,secret_ciphertext,key_version")
          return {
            eq(column, value) {
              assert.equal(column, "credential_id")
              assert.equal(value, "credential-id")
              return { maybeSingle: async () => ({ data: row, error: null }) }
            },
          }
        },
      }
    },
  }
}

test("resolves an encrypted credential only in the worker composition", async () => {
  const ciphertext = encryptProviderCredential("synthetic-provider-key", config)
  const adapter = await createOpenAIAdapterForCredential(
    fakeSupabase({ secret_ref: "managed://credential-id", secret_ciphertext: ciphertext, key_version: "v1" }),
    "credential-id",
    {
      decrypt: createCredentialDecryptor(config),
      baseUrl: "https://api.example.test/v1/",
      fetchImpl: async () => new Response(JSON.stringify({ data: [], has_more: false, next_page: null }), { status: 200 }),
    }
  )
  const page = await adapter.fetchUsage({ start: "2026-09-17T00:00:00Z", end: "2026-09-18T00:00:00Z" })
  assert.deepEqual(page.records, [])
})

test("fails before transport when the credential cannot be decrypted", async () => {
  await assert.rejects(
    createOpenAIAdapterForCredential(
      fakeSupabase({ secret_ref: "managed://credential-id", secret_ciphertext: "unknown", key_version: "v1" }),
      "credential-id",
      { decrypt: createCredentialDecryptor(config) }
    ),
    { message: "Unable to decrypt provider credential" }
  )
})
