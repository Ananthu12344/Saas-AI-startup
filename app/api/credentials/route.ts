import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const client = await createClient()
  const { data: claims } = await client.auth.getClaims()
  const userId = claims?.claims?.sub
  if (typeof userId !== "string")
    return Response.json({ error: "Authentication required" }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 })
  }
  const input = body as { workspaceId?: unknown; provider?: unknown; label?: unknown }
  if (
    typeof input.workspaceId !== "string" ||
    typeof input.provider !== "string" ||
    typeof input.label !== "string" ||
    !input.workspaceId ||
    !input.provider.trim() ||
    !input.label.trim()
  )
    return Response.json({ error: "Workspace, provider, and label are required" }, { status: 400 })

  const { data: membership } = await client
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", userId)
    .maybeSingle()
  if (!membership || !["owner", "admin"].includes(membership.role))
    return Response.json({ error: "Administrator access required" }, { status: 403 })

  const { data: provider, error: providerError } = await client
    .from("ai_providers")
    .select("id")
    .eq("slug", input.provider.trim().toLowerCase())
    .eq("enabled", true)
    .maybeSingle()
  if (providerError || !provider)
    return Response.json({ error: "Provider unavailable" }, { status: 400 })

  const { data: credential, error } = await client
    .from("api_credentials")
    .insert({
      workspace_id: input.workspaceId,
      provider_id: provider.id,
      label: input.label.trim(),
      created_by: userId,
    })
    .select("id,workspace_id,provider_id,label")
    .single()
  if (error || !credential)
    return Response.json({ error: "Unable to create credential metadata" }, { status: 400 })
  return Response.json({ credential })
}
