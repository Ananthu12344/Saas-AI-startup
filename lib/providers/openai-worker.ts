import type { SupabaseClient } from "@supabase/supabase-js"
import {
  createCredentialDecryptorFromEnv,
} from "./crypto.ts"
import {
  resolveProviderApiKey,
  type CredentialDecryptor,
} from "./credentials.ts"
import { createOpenAIAdapter, type OpenAIAdapterOptions } from "./openai-usage.ts"

export type OpenAIWorkerOptions = Omit<
  OpenAIAdapterOptions,
  "apiKey" | "validateCredential"
> & {
  decrypt?: CredentialDecryptor
}

/** Compose the trusted worker boundary; never call this from client code. */
export async function createOpenAIAdapterForCredential(
  supabase: SupabaseClient,
  credentialId: string,
  options: OpenAIWorkerOptions = {}
) {
  const decrypt = options.decrypt ?? createCredentialDecryptorFromEnv()
  const apiKey = await resolveProviderApiKey(supabase, credentialId, decrypt)
  return createOpenAIAdapter({
    ...options,
    apiKey,
    // Credential resolution is the validation step. The authenticated usage
    // request remains the provider-side validation of the key itself.
    validateCredential: async () => undefined,
  })
}
