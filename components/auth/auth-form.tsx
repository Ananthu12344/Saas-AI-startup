"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

const copy = {
  login: {
    title: "Welcome back.",
    description:
      "Track AI usage, monitor costs, and understand spending across your connected providers.",
    button: "Sign in",
  },
  signup: {
    title: "Make room for better work.",
    description: "Start your free TokenLens account.",
    button: "Create account",
  },
  forgot: {
    title: "Let’s get you back in.",
    description: "We’ll send a password reset link to your email.",
    button: "Send reset link",
  },
  reset: {
    title: "A fresh start.",
    description: "Choose a new password for your account.",
    button: "Update password",
  },
}

export function AuthForm({
  mode,
  initialError,
  hasSession = true,
}: {
  mode: keyof typeof copy
  initialError?: string
  hasSession?: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(initialError ?? "")
  const [message, setMessage] = useState("")
  const content = copy[mode]
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setMessage("")
    setPending(true)
    const form = new FormData(event.currentTarget)
    const email = String(form.get("email") ?? "").trim()
    const password = String(form.get("password") ?? "")
    if (mode === "reset" && password !== form.get("confirmPassword")) {
      setError("Your passwords do not match.")
      setPending(false)
      return
    }
    try {
      const supabase = createClient()
      const callback = `${window.location.origin}/auth/callback`
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: callback },
        })
        if (error) throw error
        if (data.session) {
          router.replace("/")
          router.refresh()
          return
        }
        setMessage(
          "Check your inbox to confirm your email. Open the link in this browser to finish signing up."
        )
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${callback}?next=/reset-password`,
        })
        if (error) throw error
        setMessage(
          "If an account exists for that email, a reset link is on its way. Open it in this browser."
        )
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        router.replace("/")
        router.refresh()
        return
      } else {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        router.replace("/")
        router.refresh()
        return
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="auth-shell">
      <Link href="/" className="auth-back">
        <ArrowLeft size={16} /> Back to home
      </Link>
      <section className="auth-card">
        <Link href="/" className="brand">
          <span className="logo-mark">
            <Sparkles size={19} />
          </span>
          TokenLens
        </Link>
        <h1>{content.title}</h1>
        <p>{content.description}</p>
        {!configured && (
          <p role="status" className="form-notice">
            Sign-in is not available yet. Please check back soon.
          </p>
        )}
        {mode === "reset" && !hasSession ? (
          <p className="form-notice">
            Open a valid password reset link from your email.{" "}
            <Link className="text-link" href="/forgot-password">
              Request a new link
            </Link>
          </p>
        ) : (
          <form onSubmit={submit} className="auth-form">
            {mode !== "reset" && (
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  required
                  disabled={pending}
                />
              </label>
            )}
            {mode !== "forgot" && (
              <label>
                {mode === "reset" ? "New password" : "Password"}
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  minLength={mode === "login" ? undefined : 8}
                  placeholder={
                    mode === "login"
                      ? "Enter your password"
                      : "At least 8 characters"
                  }
                  required
                  disabled={pending}
                />
              </label>
            )}
            {mode === "reset" && (
              <label>
                Confirm password
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  disabled={pending}
                />
              </label>
            )}
            {mode === "login" && (
              <Link
                className="text-link self-end text-sm"
                href="/forgot-password"
              >
                Forgot password?
              </Link>
            )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="form-notice">
                {message}
              </p>
            )}
            <Button
              type="submit"
              disabled={pending || !configured}
              className="primary-button w-full"
            >
              {pending ? "Please wait…" : content.button}
              <ArrowRight size={16} />
            </Button>
          </form>
        )}
        <div className="auth-switch">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <Link className="text-link" href="/login">
                Sign in
              </Link>
            </>
          ) : mode === "login" ? (
            <>
              New to TokenLens?{" "}
              <Link className="text-link" href="/signup">
                Create an account
              </Link>
            </>
          ) : (
            <Link className="text-link" href="/login">
              Back to sign in
            </Link>
          )}
        </div>
      </section>
    </main>
  )
}
