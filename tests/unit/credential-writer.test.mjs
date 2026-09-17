import assert from "node:assert/strict"
import test from "node:test"
import { createCredentialDecryptor } from "../../lib/providers/crypto.ts"
import { writeProviderCredentialSecret } from "../../lib/providers/credential-writer.ts"

const config = { key: Buffer.alloc(32, 9), keyVersion: "v1" }

test("writes only encrypted credential material", async () => {
  let written
  const supabase = {
    from(table) {
      assert.equal(table, "api_credential_secrets")
      return {
        async upsert(values, options) {
          written = { values, options }
          return { error: null }
        },
      }
    },
  }
  await writeProviderCredentialSecret(
    supabase,
    "credential-id",
    "managed://credential-id",
    "synthetic-provider-key",
    config
  )
  assert.deepEqual(written.options, { onConflict: "credential_id" })
  assert.equal(written.values.credential_id, "credential-id")
  assert.equal(written.values.secret_ref, "managed://credential-id")
  assert.equal(written.values.key_version, "v1")
  assert.notEqual(written.values.secret_ciphertext, "synthetic-provider-key")
  assert.equal(
    await createCredentialDecryptor(config)({
      secret_ref: written.values.secret_ref,
      secret_ciphertext: written.values.secret_ciphertext,
      key_version: written.values.key_version,
    }),
    "synthetic-provider-key"
  )
})

test("fails safely when storage rejects the encrypted write", async () => {
  const supabase = {
    from() {
      return {
        async upsert() {
          return { error: { message: "database detail" } }
        },
      }
    },
  }
  await assert.rejects(
    writeProviderCredentialSecret(
      supabase,
      "credential-id",
      "managed://credential-id",
      "synthetic-provider-key",
      config
    ),
    { message: "Unable to store provider credential" }
  )
})
