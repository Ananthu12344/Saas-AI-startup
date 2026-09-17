import type { SupabaseClient } from "@supabase/supabase-js"

export type EncryptedCredential = {
  secret_ref: string
  secret_ciphertext: string | null
  key_version: string | null
}

export type CredentialDecryptor = (
  record: EncryptedCredential
) => Promise<string>

/**
 * Resolve a provider key only inside a trusted worker or server route. The
 * database stores ciphertext or an external secret reference; decryption keys
 * must remain in protected runtime configuration or a managed secret system.
 */
export async function resolveProviderApiKey(
  supabase: SupabaseClient,
  credentialId: string,
  decrypt: CredentialDecryptor
) {
  const { data, error } = await supabase
    .from("api_credential_secrets")
    .select("secret_ref,secret_ciphertext,key_version")
    .eq("credential_id", credentialId)
    .maybeSingle()
  if (error) throw new Error("Unable to load provider credential")
  if (!data) throw new Error("Provider credential is unavailable")
  if (!data.secret_ciphertext && !data.secret_ref)
    throw new Error("Provider credential is empty")

  let apiKey: string
  try {
    apiKey = await decrypt(data as EncryptedCredential)
  } catch {
    throw new Error("Unable to decrypt provider credential")
  }
  if (!apiKey.trim()) throw new Error("Provider credential is empty")
  return apiKey
}
