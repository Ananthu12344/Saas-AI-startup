import { AuthForm } from "@/components/auth/auth-form"
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return (
    <AuthForm
      mode="login"
      initialError={
        error === "callback"
          ? "This email link is invalid or expired. Try signing in or request a new password reset link."
          : undefined
      }
    />
  )
}
