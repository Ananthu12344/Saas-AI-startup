import { AuthForm } from "@/components/auth/auth-form"
import { createClient } from "@/lib/supabase/server"
export default async function ResetPasswordPage() {
  let hasSession = false
  if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = await createClient()
    const { data } = await supabase.auth.getClaims()
    hasSession = Boolean(data?.claims)
  }
  return <AuthForm mode="reset" hasSession={hasSession} />
}
