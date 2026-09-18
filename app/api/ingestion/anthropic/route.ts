import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createAnthropicAdapterForCredential } from "@/lib/providers/anthropic-worker"
import { runProviderSync } from "@/lib/ingestion/run"

export const runtime = "nodejs"

function validDate(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
}

export async function POST(request: Request) {
  const sessionClient = await createClient()
  const { data: claims } = await sessionClient.auth.getClaims()
  const userId = claims?.claims?.sub
  if (typeof userId !== "string")
    return Response.json({ error: "Authentication required" }, { status: 401 })
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 })
  }
  const input = body as { workspaceId?: unknown; credentialId?: unknown; start?: unknown; end?: unknown }
  if (typeof input.workspaceId !== "string" || typeof input.credentialId !== "string" || !validDate(input.start) || !validDate(input.end))
    return Response.json({ error: "Workspace, credential, start, and end are required" }, { status: 400 })
  const start = Date.parse(input.start as string)
  const end = Date.parse(input.end as string)
  if (end <= start || end - start > 7 * 24 * 60 * 60 * 1000)
    return Response.json({ error: "Usage window must be 1–7 days" }, { status: 400 })
  const { data: membership } = await sessionClient
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", userId)
    .maybeSingle()
  if (!membership || !["owner", "admin"].includes(membership.role))
    return Response.json({ error: "Administrator access required" }, { status: 403 })
  const { data: credential } = await sessionClient
    .from("api_credentials")
    .select("id,workspace_id,provider_id")
    .eq("id", input.credentialId)
    .eq("workspace_id", input.workspaceId)
    .maybeSingle()
  if (!credential) return Response.json({ error: "Credential unavailable" }, { status: 404 })
  try {
    const adminClient = createAdminClient()
    const { data: provider } = await adminClient
      .from("ai_providers")
      .select("slug")
      .eq("id", credential.provider_id)
      .eq("slug", "anthropic")
      .single()
    if (!provider) return Response.json({ error: "Anthropic credential required" }, { status: 400 })
    const adapter = await createAnthropicAdapterForCredential(adminClient, credential.id)
    const result = await runProviderSync({
      supabase: adminClient,
      adapter,
      provider: "anthropic",
      providerId: credential.provider_id,
      credentialId: credential.id,
      context: { workspaceId: input.workspaceId, environment: "production" },
      window: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
    })
    return Response.json({ ok: true, result })
  } catch {
    return Response.json({ error: "Anthropic usage sync failed" }, { status: 502 })
  }
}
