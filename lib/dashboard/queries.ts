import { readAllRows } from "./pagination"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

type Numeric = number | string | null

export type DashboardRow = {
  workspace_id: string
  [key: string]: unknown
}

export type DashboardData = {
  workspace: { id: string; name: string; slug: string; role: string }
  credentials: Array<{
    id: string
    label: string
    provider: string
    provider_name: string
    secret_saved: boolean
    last_success_at: string | null
    last_error: string | null
  }>
  alerts: Array<{
    id: string
    kind: string
    severity: string
    message: string
    acknowledged_at: string | null
    created_at: string
  }>
  workspace_projects: Array<{ id: string; name: string; slug: string }>
  workspace_applications: Array<{ id: string; name: string; slug: string; environment: string; project_id: string }>
  daily: Array<
    DashboardRow & {
      day: string
      total_tokens: number
      total_cost: number
      request_count: number
    }
  >
  providers: Array<
    DashboardRow & {
      provider: string
      name: string
      total_tokens: number
      total_cost: number
      request_count: number
    }
  >
  models: Array<
    DashboardRow & {
      model: string
      total_tokens: number
      total_cost: number
      request_count: number
    }
  >
  projects: Array<
    DashboardRow & {
      project: string
      total_tokens: number
      total_cost: number
      request_count: number
    }
  >
  applications: Array<
    DashboardRow & {
      application: string
      total_tokens: number
      total_cost: number
      request_count: number
    }
  >
  budgets: Array<
    DashboardRow & {
      id: string
      scope_type: string
      period_start: string
      period_end: string
      name: string
      amount: number
      spent: number
      remaining: number
      consumed_ratio: number | null
      alert_threshold: number
    }
  >
  waste: Array<
    DashboardRow & {
      model: string
      cost: number
      input_tokens: number
      output_tokens: number
      occurred_at: string
      waste_reason: string | null
    }
  >
  anomalies: Array<
    DashboardRow & {
      day: string
      total_cost: number
      total_tokens: number
      mean_cost: number
      stddev_cost: number
    }
  >
}

const numberValue = (value: Numeric) => {
  if (value === null || value === "" || !Number.isFinite(Number(value))) {
    throw new Error("Invalid dashboard numeric value")
  }
  return Number(value)
}

const withNumbers = <T extends Record<string, unknown>>(
  row: T,
  fields: string[]
) => {
  const result: Record<string, unknown> = { ...row }
  for (const field of fields) {
    result[field] =
      field === "consumed_ratio" && row[field] === null
        ? null
        : numberValue(row[field] as Numeric)
  }
  return result as T
}

async function readView<T extends Record<string, unknown>>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  view: string,
  workspaceId: string,
  numericFields: string[]
) {
  const order: Record<string, string[]> = {
    usage_daily: ["day"],
    usage_cost_by_provider: ["provider"],
    usage_cost_by_model: ["provider_id", "model"],
    usage_cost_by_project: ["project_id"],
    usage_cost_by_application: ["application_id"],
    budget_consumption: ["id"],
    potential_waste: ["occurred_at", "id"],
    usage_anomalies: ["day"],
  }
  const rows = await readAllRows<T>(async (from, to) => {
    let query = supabase
      .from(view)
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId)
    for (const column of order[view])
      query = query.order(column, { ascending: true, nullsFirst: true })
    const { data, error, count } = await query.range(from, to)
    if (error || count === null) throw new Error(`Unable to read ${view}`)
    return { rows: (data ?? []) as T[], count }
  })
  return rows.map((row) => withNumbers(row, numericFields))
}

type DashboardResult =
  | { status: "unauthenticated" }
  | { status: "no-workspace" }
  | { status: "unsupported-currency" }
  | { status: "unknown-cost" }
  | { status: "ready"; data: DashboardData }

export async function getDashboardData(): Promise<DashboardResult> {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims?.sub) return { status: "unauthenticated" }

  const { data: workspaces, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, name, slug")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
  if (workspaceError) throw new Error("Unable to read workspaces")
  const workspace = workspaces?.[0]
  if (!workspace) return { status: "no-workspace" }

  const workspaceId = workspace.id as string
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", claims.claims.sub)
    .maybeSingle()
  if (membershipError || !membership) throw new Error("Unable to read workspace membership")

  const credentialsPromise = (async () => {
    const { data: credentials, error } = await supabase
      .from("api_credentials")
      .select("id,label,provider_id")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true })
    if (error) throw new Error("Unable to read credentials")
    const providerIds = (credentials ?? []).map((item) => item.provider_id)
    const { data: providers } = providerIds.length
      ? await supabase.from("ai_providers").select("id,slug,name").in("id", providerIds)
      : { data: [] as Array<{ id: string; slug: string; name: string }> }
    const providerById = new Map((providers ?? []).map((provider) => [provider.id, provider]))
    let secrets: Array<{ credential_id: string }> = []
    let checkpoints: Array<{ credential_id: string; last_success_at: string | null; last_error: string | null }> = []
    try {
      const admin = createAdminClient()
      const [secretResult, checkpointResult] = await Promise.all([
        admin.from("api_credential_secrets").select("credential_id").in("credential_id", (credentials ?? []).map((item) => item.id)),
        admin.from("ingestion_checkpoints").select("credential_id,last_success_at,last_error").eq("workspace_id", workspaceId),
      ])
      if (!secretResult.error) secrets = secretResult.data ?? []
      if (!checkpointResult.error) checkpoints = checkpointResult.data ?? []
    } catch {
      // Configuration status is unavailable when the protected admin client is not configured.
    }
    const secretIds = new Set(secrets.map((secret) => secret.credential_id))
    const checkpointByCredential = new Map(checkpoints.map((checkpoint) => [checkpoint.credential_id, checkpoint]))
    return (credentials ?? []).map((credential) => {
      const provider = providerById.get(credential.provider_id)
      const checkpoint = checkpointByCredential.get(credential.id)
      return {
        id: credential.id,
        label: credential.label,
        provider: provider?.slug ?? "unknown",
        provider_name: provider?.name ?? "Unknown provider",
        secret_saved: secretIds.has(credential.id),
        last_success_at: checkpoint?.last_success_at ?? null,
        last_error: checkpoint?.last_error ?? null,
      }
    })
  })()
  const alertsPromise = supabase
    .from("alerts")
    .select("id,kind,severity,message,acknowledged_at,created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100)
    .then(({ data, error }) => {
      if (error) throw new Error("Unable to read alerts")
      return (data ?? []) as DashboardData["alerts"]
    })
  const projectsPromise = supabase
    .from("projects")
    .select("id,name,slug")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true })
    .then(({ data, error }) => {
      if (error) throw new Error("Unable to read projects")
      return (data ?? []) as DashboardData["workspace_projects"]
    })
  const applicationsPromise = supabase
    .from("applications")
    .select("id,name,slug,environment,project_id")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true })
    .then(({ data, error }) => {
      if (error) throw new Error("Unable to read applications")
      return (data ?? []) as DashboardData["workspace_applications"]
    })
  const [
    daily,
    providers,
    models,
    projects,
    applications,
    budgets,
    waste,
    anomalies,
    credentials,
    alerts,
    workspaceProjects,
    workspaceApplications,
  ] = await Promise.all([
    readView(supabase, "usage_daily", workspaceId, [
      "input_tokens",
      "output_tokens",
      "cached_input_tokens",
      "reasoning_tokens",
      "total_tokens",
      "total_cost",
      "request_count",
    ]),
    readView(supabase, "usage_cost_by_provider", workspaceId, [
      "total_tokens",
      "total_cost",
      "request_count",
    ]),
    readView(supabase, "usage_cost_by_model", workspaceId, [
      "total_tokens",
      "total_cost",
      "request_count",
    ]),
    readView(supabase, "usage_cost_by_project", workspaceId, [
      "total_tokens",
      "total_cost",
      "request_count",
    ]),
    readView(supabase, "usage_cost_by_application", workspaceId, [
      "total_tokens",
      "total_cost",
      "request_count",
    ]),
    readView(supabase, "budget_consumption", workspaceId, [
      "amount",
      "spent",
      "remaining",
      "consumed_ratio",
      "alert_threshold",
    ]),
    readView(supabase, "potential_waste", workspaceId, [
      "cost",
      "input_tokens",
      "output_tokens",
    ]),
    readView(supabase, "usage_anomalies", workspaceId, [
      "total_tokens",
      "total_cost",
      "request_count",
      "mean_cost",
      "stddev_cost",
    ]),
    credentialsPromise,
    alertsPromise,
    projectsPromise,
    applicationsPromise,
  ])

  // Existing views cannot separate currencies or missing prices. Withhold the
  // report instead of treating mixed amounts or unpriced usage as USD totals.
  const [currencyCheck, costCheck] = await Promise.all([
    supabase
      .from("usage_events")
      .select("id")
      .eq("workspace_id", workspaceId)
      .neq("currency", "USD")
      .limit(1),
    supabase
      .from("usage_events")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("cost_status", "unknown")
      .limit(1),
  ])
  if (currencyCheck.error || costCheck.error)
    throw new Error("Unable to verify usage costs")
  if (currencyCheck.data?.length) return { status: "unsupported-currency" }
  if (costCheck.data?.length) return { status: "unknown-cost" }

  return {
    status: "ready",
    data: {
      workspace: { ...(workspace as Omit<DashboardData["workspace"], "role">), role: membership.role },
      credentials,
      alerts,
      workspace_projects: workspaceProjects,
      workspace_applications: workspaceApplications,
      daily: daily as DashboardData["daily"],
      providers: providers as DashboardData["providers"],
      models: models as DashboardData["models"],
      projects: projects as DashboardData["projects"],
      applications: applications as DashboardData["applications"],
      budgets: budgets as DashboardData["budgets"],
      waste: waste as DashboardData["waste"],
      anomalies: anomalies as DashboardData["anomalies"],
    },
  }
}
