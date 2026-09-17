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
  const input = body as { name?: unknown; slug?: unknown }
  if (
    typeof input.name !== "string" ||
    typeof input.slug !== "string" ||
    !input.name.trim() ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)
  )
    return Response.json({ error: "Name and a valid slug are required" }, { status: 400 })

  const { data: workspace, error } = await client
    .from("workspaces")
    .insert({ name: input.name.trim(), slug: input.slug, created_by: userId })
    .select("id,name,slug")
    .single()
  if (error || !workspace)
    return Response.json({ error: "Unable to create workspace" }, { status: 400 })
  return Response.json({ workspace }, { status: 201 })
}
