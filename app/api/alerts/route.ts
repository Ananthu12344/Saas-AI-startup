import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const client = await createClient()
  const { data: claims } = await client.auth.getClaims()
  if (typeof claims?.claims?.sub !== "string")
    return Response.json({ error: "Authentication required" }, { status: 401 })
  const workspaceId = new URL(request.url).searchParams.get("workspaceId")
  if (!workspaceId)
    return Response.json({ error: "Workspace is required" }, { status: 400 })
  const { data: alerts, error } = await client
    .from("alerts")
    .select("id,workspace_id,budget_id,usage_event_id,kind,severity,message,metadata,acknowledged_at,created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100)
  if (error) return Response.json({ error: "Unable to load alerts" }, { status: 500 })
  return Response.json({ alerts: alerts ?? [] })
}
