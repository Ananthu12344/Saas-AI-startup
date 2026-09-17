import type { SupabaseClient } from "@supabase/supabase-js"
import type { NormalizedUsageEvent, ProviderSlug } from "@/lib/providers/types"

/**
 * Trusted server boundary for provider-poll records. This module must only be
 * called by a server worker or Edge Function using a credential that can write
 * usage_events; browser clients must remain read-only.
 */
export type IngestionContext = {
  workspaceId: string
  credentialId?: string
  projectId?: string
  applicationId?: string
  environment: "development" | "staging" | "production" | "other"
}

const blockedMetadataKeys =
  /(?:prompt|response|message|content|secret|token|key|authorization|cookie)/i

function metadataValue(value: unknown, depth = 0): unknown {
  if (
    depth > 2 ||
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value
  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => metadataValue(item, depth + 1))
  if (typeof value !== "object") return undefined
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 50)
      .flatMap(([key, item]) =>
        blockedMetadataKeys.test(key)
          ? []
          : [[key, metadataValue(item, depth + 1)]]
      )
  )
}

export function sanitizeUsageMetadata(
  metadata: Record<string, unknown> | undefined
) {
  const safe = metadataValue(metadata ?? {})
  const serialized = JSON.stringify(safe ?? {})
  if (serialized.length > 16_384)
    throw new Error("Usage metadata exceeds the 16 KB limit")
  return (safe ?? {}) as Record<string, unknown>
}

function nonNegativeInteger(value: number | undefined, field: string) {
  if (value === undefined) return 0
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("Invalid " + field)
  return value
}

export function buildUsageEventRow(
  event: NormalizedUsageEvent,
  context: IngestionContext,
  providerId: string
) {
  if (!event.model || !event.occurredAt || !event.idempotencyKey)
    throw new Error("Usage event is missing identity")
  const occurredAt = new Date(event.occurredAt)
  if (Number.isNaN(occurredAt.getTime()))
    throw new Error("Invalid usage timestamp")
  if (event.currency && !/^[A-Z]{3}$/.test(event.currency))
    throw new Error("Invalid usage currency")
  if (
    event.cost !== undefined &&
    (!Number.isFinite(event.cost) || event.cost < 0)
  )
    throw new Error("Invalid usage cost")
  return {
    workspace_id: context.workspaceId,
    project_id: context.projectId ?? null,
    application_id: context.applicationId ?? null,
    provider_id: providerId,
    credential_id: context.credentialId ?? null,
    model: event.model,
    input_tokens: nonNegativeInteger(event.inputTokens, "input tokens"),
    output_tokens: nonNegativeInteger(event.outputTokens, "output tokens"),
    cached_input_tokens: nonNegativeInteger(
      event.cachedInputTokens,
      "cached input tokens"
    ),
    reasoning_tokens: nonNegativeInteger(
      event.reasoningTokens,
      "reasoning tokens"
    ),
    cost: event.cost ?? 0,
    currency: event.currency ?? "USD",
    cost_status: event.costStatus,
    provider_request_id: event.providerRequestId ?? null,
    idempotency_key: event.idempotencyKey,
    ingestion_source: event.ingestionSource,
    request_status: event.status ?? "unknown",
    latency_ms: event.latencyMs ?? null,
    environment: context.environment,
    occurred_at: occurredAt.toISOString(),
    request_metadata: sanitizeUsageMetadata(event.metadata),
  }
}

export async function ingestUsagePage(
  supabase: SupabaseClient,
  provider: ProviderSlug,
  events: NormalizedUsageEvent[],
  context: IngestionContext
) {
  const { data: providerRow, error: providerError } = await supabase
    .from("ai_providers")
    .select("id")
    .eq("slug", provider)
    .eq("enabled", true)
    .single()
  if (providerError || !providerRow) throw new Error("Provider is unavailable")
  if (events.length === 0) return { inserted: 0 }
  const rows = events.map((event) =>
    buildUsageEventRow(event, context, providerRow.id)
  )
  const { data, error } = await supabase
    .from("usage_events")
    .upsert(rows, {
      onConflict: "workspace_id,ingestion_source,idempotency_key",
      ignoreDuplicates: true,
    })
    .select("id")
  if (error) throw new Error("Usage ingestion failed")
  return { inserted: data?.length ?? 0 }
}
