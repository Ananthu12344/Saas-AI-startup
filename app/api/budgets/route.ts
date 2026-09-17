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
  const input = body as {
    workspaceId?: unknown
    name?: unknown
    amount?: unknown
    periodStart?: unknown
    periodEnd?: unknown
    alertThreshold?: unknown
  }
  const amount = Number(input.amount)
  const threshold = input.alertThreshold === undefined ? 0.8 : Number(input.alertThreshold)
  if (
    typeof input.workspaceId !== "string" ||
    typeof input.name !== "string" ||
    !input.workspaceId ||
    !input.name.trim() ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !validDate(input.periodStart) ||
    !validDate(input.periodEnd) ||
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 1 ||
    Date.parse(input.periodEnd as string) <= Date.parse(input.periodStart as string)
  )
    return Response.json({ error: "Invalid workspace budget" }, { status: 400 })

  const { data: membership } = await client
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", userId)
    .maybeSingle()
  if (!membership || !["owner", "admin"].includes(membership.role))
    return Response.json({ error: "Administrator access required" }, { status: 403 })

  const { data: budget, error } = await client
    .from("budgets")
    .insert({
      workspace_id: input.workspaceId,
      scope_type: "workspace",
      name: input.name.trim(),
      amount,
      period_start: new Date(input.periodStart as string).toISOString(),
      period_end: new Date(input.periodEnd as string).toISOString(),
      alert_threshold: threshold,
    })
    .select("id,workspace_id,scope_type,name,amount,period_start,period_end,alert_threshold")
    .single()
  if (error || !budget)
    return Response.json({ error: "Unable to create budget" }, { status: 400 })
  return Response.json({ budget }, { status: 201 })
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
}
