import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const client = await createClient()
  const { data: claims } = await client.auth.getClaims()
  const userId = claims?.claims?.sub
  if (typeof userId !== "string") return Response.json({ error: "Authentication required" }, { status: 401 })
  const body = await request.json().catch(() => null) as { workspaceId?: unknown; name?: unknown; slug?: unknown } | null
  if (!body || typeof body.workspaceId !== "string" || typeof body.name !== "string" || typeof body.slug !== "string" || !body.name.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug))
    return Response.json({ error: "Workspace, name, and a valid slug are required" }, { status: 400 })
  const { data: membership } = await client.from("workspace_members").select("role").eq("workspace_id", body.workspaceId).eq("user_id", userId).maybeSingle()
  if (!membership) return Response.json({ error: "Workspace membership required" }, { status: 403 })
  const { data: project, error } = await client.from("projects").insert({ workspace_id: body.workspaceId, name: body.name.trim(), slug: body.slug, created_by: userId }).select("id,name,slug,workspace_id").single()
  if (error || !project) return Response.json({ error: "Unable to create project" }, { status: 400 })
  return Response.json({ project }, { status: 201 })
}
