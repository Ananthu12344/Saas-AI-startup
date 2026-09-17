import { createClient } from "@supabase/supabase-js"

/** Server-only service client. Never import this module from client code. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey)
    throw new Error("Supabase server credential configuration is unavailable")
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
