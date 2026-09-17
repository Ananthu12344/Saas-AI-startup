import { encryptProviderCredential, type CredentialCryptoConfig } from "./crypto.ts"

type CredentialSecretStore = {
  from(table: string): {
    upsert(
      values: Record<string, unknown>,
      options: { onConflict: string }
    ): Promise<{ error: { message?: string } | null }>
  }
}

/**
 * Store a provider credential from a trusted server or worker only.
 * The plaintext exists only for the duration of this call and is never
 * returned or written to logs.
 */
export async function writeProviderCredentialSecret(
  supabase: CredentialSecretStore,
  credentialId: string,
  secretRef: string,
  plaintext: string,
  config: CredentialCryptoConfig
) {
  if (!credentialId || !secretRef.trim())
    throw new Error("Provider credential identity is invalid")
  const secretCiphertext = encryptProviderCredential(plaintext, config)
  const { error } = await supabase
    .from("api_credential_secrets")
    .upsert(
      {
        credential_id: credentialId,
        secret_ref: secretRef,
        secret_ciphertext: secretCiphertext,
        key_version: config.keyVersion,
      },
      { onConflict: "credential_id" }
    )
  if (error) throw new Error("Unable to store provider credential")
}
