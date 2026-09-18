import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const client = await createClient()
  const { data: claims } = await client.auth.getClaims()
  const userId = claims?.claims?.sub
  if (typeof userId !== "string") return Response.json({ error: "Authentication required" }, { status: 401 })
  const body = await request.json().catch(() => null) as { workspaceId?: unknown; projectId?: unknown; name?: unknown; slug?: unknown; environment?: unknown } | null
  const environment = body?.environment ?? "production"
  if (!body || typeof body.workspaceId !== "string" || typeof body.projectId !== "string" || typeof body.name !== "string" || typeof body.slug !== "string" || !body.name.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug) || !["development", "staging", "production", "other"].includes(String(environment)))
    return Response.json({ error: "Workspace, project, name, slug, and environment are required" }, { status: 400 })
  const { data: membership } = await client.from("workspace_members").select("role").eq("workspace_id", body.workspaceId).eq("user_id", userId).maybeSingle()
  if (!membership) return Response.json({ error: "Workspace membership required" }, { status: 403 })
  const { data: application, error } = await client.from("applications").insert({ workspace_id: body.workspaceId, project_id: body.projectId, name: body.name.trim(), slug: body.slug, environment, created_by: userId }).select("id,name,slug,environment,project_id,workspace_id").single()
  if (error || !application) return Response.json({ error: "Unable to create application" }, { status: 400 })
  return Response.json({ application }, { status: 201 })
}
