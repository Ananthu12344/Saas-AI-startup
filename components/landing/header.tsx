import Link from "next/link"
import { Sparkles } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { HeaderMenu } from "./header-menu"

export async function Header() {
  let email: string | null = null
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    const supabase = await createClient()
    const { data } = await supabase.auth.getClaims()
    if (data?.claims) email = String(data.claims.email ?? "Your account")
  }
  return (
    <header className="site-header">
      <div className="page-width header-inner">
        <Link href="/" className="brand" aria-label="Clarity AI home">
          <span className="logo-mark">
            <Sparkles size={19} />
          </span>
          Clarity<span className="brand-ai">AI</span>
        </Link>
        <nav aria-label="Main navigation" className="desktop-nav">
          <Link href="/#features">Features</Link>
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/#pricing">Pricing</Link>
        </nav>
        <HeaderMenu email={email} />
      </div>
    </header>
  )
}
