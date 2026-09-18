import type { SupabaseClient } from "@supabase/supabase-js"
import { createCredentialDecryptorFromEnv } from "./crypto.ts"
import { resolveProviderApiKey, type CredentialDecryptor } from "./credentials.ts"
import { createAnthropicAdapter, type AnthropicAdapterOptions } from "./anthropic-usage.ts"

export type AnthropicWorkerOptions = Omit<AnthropicAdapterOptions, "apiKey" | "validateCredential"> & {
  decrypt?: CredentialDecryptor
}

export async function createAnthropicAdapterForCredential(
  supabase: SupabaseClient,
  credentialId: string,
  options: AnthropicWorkerOptions = {}
) {
  const decrypt = options.decrypt ?? createCredentialDecryptorFromEnv()
  const apiKey = await resolveProviderApiKey(supabase, credentialId, decrypt)
  return createAnthropicAdapter({
    ...options,
    apiKey,
    validateCredential: async () => undefined,
  })
}
