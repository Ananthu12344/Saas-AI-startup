import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { credentialCryptoConfigFromEnv } from "@/lib/providers/crypto"
import { writeProviderCredentialSecret } from "@/lib/providers/credential-writer"

export const runtime = "nodejs"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ credentialId: string }> }
) {
  const { credentialId } = await params
  if (!credentialId) return Response.json({ error: "Invalid credential" }, { status: 400 })

  const sessionClient = await createClient()
  const { data: claims } = await sessionClient.auth.getClaims()
  const userId = claims?.claims?.sub
  if (typeof userId !== "string")
    return Response.json({ error: "Authentication required" }, { status: 401 })

  const { data: credential, error: credentialError } = await sessionClient
    .from("api_credentials")
    .select("workspace_id")
    .eq("id", credentialId)
    .maybeSingle()
  if (credentialError || !credential)
    return Response.json({ error: "Credential unavailable" }, { status: 404 })

  const { data: membership } = await sessionClient
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", credential.workspace_id)
    .eq("user_id", userId)
    .maybeSingle()
  if (!membership || !["owner", "admin"].includes(membership.role))
    return Response.json({ error: "Administrator access required" }, { status: 403 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 })
  }
  const input = body as { secret?: unknown; secretRef?: unknown }
  if (typeof input.secret !== "string" || !input.secret.trim())
    return Response.json({ error: "Credential secret is required" }, { status: 400 })
  const secretRef = typeof input.secretRef === "string" ? input.secretRef : `managed://${credentialId}`
  if (!secretRef.trim()) return Response.json({ error: "Credential reference is required" }, { status: 400 })

  try {
    const adminClient = createAdminClient()
    const cryptoConfig = credentialCryptoConfigFromEnv()
    await writeProviderCredentialSecret(
      adminClient,
      credentialId,
      secretRef,
      input.secret,
      cryptoConfig
    )
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: "Unable to store provider credential" }, { status: 503 })
  }
}
