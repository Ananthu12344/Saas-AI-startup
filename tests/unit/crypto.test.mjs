import assert from "node:assert/strict"
import test from "node:test"
import {
  createCredentialDecryptor,
  createCredentialDecryptorFromEnv,
  encryptProviderCredential,
} from "../../lib/providers/crypto.ts"

const config = { key: Buffer.alloc(32, 7), keyVersion: "v1" }

test("round-trips a new credential with versioned authenticated encryption", async () => {
  const ciphertext = encryptProviderCredential("synthetic-provider-key", config)
  assert.match(
    ciphertext,
    /^v1\.v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
  )
  const decrypt = createCredentialDecryptor(config)
  assert.equal(
    await decrypt({
      secret_ref: "local",
      secret_ciphertext: ciphertext,
      key_version: "v1",
    }),
    "synthetic-provider-key"
  )
})

test("fails closed for wrong keys, versions, and unsupported legacy formats", async () => {
  const ciphertext = encryptProviderCredential("synthetic-provider-key", config)
  await assert.rejects(
    createCredentialDecryptor({ key: Buffer.alloc(32, 8), keyVersion: "v1" })({
      secret_ref: "local",
      secret_ciphertext: ciphertext,
      key_version: "v1",
    }),
    { message: "Unable to decrypt provider credential" }
  )
  await assert.rejects(
    createCredentialDecryptor({ key: config.key, keyVersion: "v2" })({
      secret_ref: "local",
      secret_ciphertext: ciphertext,
      key_version: "v1",
    }),
    { message: "Unable to decrypt provider credential" }
  )
  await assert.rejects(
    createCredentialDecryptor(config)({
      secret_ref: "legacy",
      secret_ciphertext: "unknown-format",
      key_version: null,
    }),
    { message: "Unable to decrypt provider credential" }
  )
})

test("requires protected runtime configuration without printing key material", () => {
  assert.throws(() => createCredentialDecryptorFromEnv({}), {
    message: "Credential encryption configuration is unavailable",
  })
  const decrypt = createCredentialDecryptorFromEnv({
    CLARITY_CREDENTIAL_MASTER_KEY: Buffer.alloc(32, 7).toString("base64"),
    CLARITY_CREDENTIAL_KEY_VERSION: "v1",
  })
  assert.equal(typeof decrypt, "function")
})
