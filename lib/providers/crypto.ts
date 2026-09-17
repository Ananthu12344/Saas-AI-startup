import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import type { CredentialDecryptor } from "./credentials.ts"

const ALGORITHM = "aes-256-gcm"
const FORMAT = "v1"
const IV_BYTES = 12
const KEY_BYTES = 32
const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

export type CredentialCryptoConfig = {
  key: Buffer
  keyVersion: string
}

function validateConfig(config: CredentialCryptoConfig) {
  if (!Buffer.isBuffer(config.key) || config.key.length !== KEY_BYTES)
    throw new Error("Credential encryption key must be 32 bytes")
  if (!VERSION_PATTERN.test(config.keyVersion))
    throw new Error("Credential encryption key version is invalid")
}

function decode(value: string) {
  return Buffer.from(value, "base64url")
}

/** Encrypt plaintext for new credential entry; never use this for unknown legacy rows. */
export function encryptProviderCredential(
  plaintext: string,
  config: CredentialCryptoConfig
) {
  validateConfig(config)
  if (!plaintext) throw new Error("Provider credential is empty")
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, config.key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return [
    FORMAT,
    config.keyVersion,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".")
}

export function createCredentialDecryptor(
  config: CredentialCryptoConfig
): CredentialDecryptor {
  validateConfig(config)
  return async (record) => {
    try {
      if (!record.secret_ciphertext)
        throw new Error("Credential ciphertext is unavailable")
      const [format, keyVersion, encodedIv, encodedTag, encodedCiphertext] =
        record.secret_ciphertext.split(".")
      if (
        format !== FORMAT ||
        keyVersion !== config.keyVersion ||
        !encodedIv ||
        !encodedTag ||
        !encodedCiphertext
      )
        throw new Error("Credential ciphertext format is unsupported")
      const iv = decode(encodedIv)
      const tag = decode(encodedTag)
      const ciphertext = decode(encodedCiphertext)
      if (
        iv.length !== IV_BYTES ||
        tag.length !== 16 ||
        ciphertext.length === 0
      )
        throw new Error("Credential ciphertext is malformed")
      const decipher = createDecipheriv(ALGORITHM, config.key, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8")
    } catch {
      throw new Error("Unable to decrypt provider credential")
    }
  }
}

/** Read only protected runtime configuration; never expose these values to clients. */
export function credentialCryptoConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
) {
  const encodedKey = env.CLARITY_CREDENTIAL_MASTER_KEY
  const keyVersion = env.CLARITY_CREDENTIAL_KEY_VERSION
  if (!encodedKey || !keyVersion)
    throw new Error("Credential encryption configuration is unavailable")
  const key = Buffer.from(encodedKey, "base64")
  const config = { key, keyVersion }
  validateConfig(config)
  return config
}

export function createCredentialDecryptorFromEnv(
  env: NodeJS.ProcessEnv = process.env
) {
  return createCredentialDecryptor(credentialCryptoConfigFromEnv(env))
}
