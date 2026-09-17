import type { NormalizedUsageEvent, ProviderUsageRecord, ProviderSlug } from "@/lib/providers/types"

export function normalizeUsageRecord(
  provider: ProviderSlug,
  record: ProviderUsageRecord,
  ingestionSource: NormalizedUsageEvent["ingestionSource"] = "provider_poll"
): NormalizedUsageEvent {
  const idempotencyKey = record.providerRequestId
    ? `${provider}:${record.providerRequestId}`
    : [
        provider,
        record.model,
        record.occurredAt,
        record.inputTokens ?? 0,
        record.outputTokens ?? 0,
      ].join(":")

  return {
    ...record,
    provider,
    ingestionSource,
    idempotencyKey,
    costStatus: record.cost === undefined ? "unknown" : "actual",
  }
}
