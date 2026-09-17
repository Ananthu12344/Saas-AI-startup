import { encryptProviderCredential, type CredentialCryptoConfig } from "./crypto.ts"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Store a provider credential from a trusted server or worker only.
 * The plaintext exists only for the duration of this call and is never
 * returned or written to logs.
 */
export async function writeProviderCredentialSecret(
  supabase: SupabaseClient,
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
