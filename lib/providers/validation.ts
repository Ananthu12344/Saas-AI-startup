import type { ProviderUsagePage, ProviderUsageRecord } from "./types"

function record(value: unknown): ProviderUsageRecord {
  if (!value || typeof value !== "object")
    throw new Error("Invalid usage record")
  const item = value as Record<string, unknown>
  if (typeof item.model !== "string" || !item.model.trim())
    throw new Error("Usage record is missing a model")
  if (
    typeof item.occurredAt !== "string" ||
    Number.isNaN(new Date(item.occurredAt).getTime())
  )
    throw new Error("Usage record has an invalid timestamp")

  for (const field of [
    "inputTokens",
    "outputTokens",
    "cachedInputTokens",
    "reasoningTokens",
  ]) {
    const tokenCount = item[field]
    if (
      tokenCount !== undefined &&
      (!Number.isSafeInteger(tokenCount) || (tokenCount as number) < 0)
    )
      throw new Error("Usage record has invalid token counts")
  }
  if (
    item.cost !== undefined &&
    (typeof item.cost !== "number" ||
      !Number.isFinite(item.cost) ||
      item.cost < 0)
  )
    throw new Error("Usage record has invalid cost")
  if (
    item.currency !== undefined &&
    (typeof item.currency !== "string" || !/^[A-Z]{3}$/.test(item.currency))
  )
    throw new Error("Usage record has invalid currency")
  return item as ProviderUsageRecord
}

export function validateProviderUsagePage(value: unknown): ProviderUsagePage {
  if (!value || typeof value !== "object") throw new Error("Invalid usage page")
  const page = value as Record<string, unknown>
  if (!Array.isArray(page.records))
    throw new Error("Usage page is missing records")
  if (
    typeof page.windowEnd !== "string" ||
    Number.isNaN(new Date(page.windowEnd).getTime())
  )
    throw new Error("Usage page has an invalid window")
  if (page.nextCursor !== undefined && typeof page.nextCursor !== "string")
    throw new Error("Usage page has an invalid cursor")
  return {
    records: page.records.map(record),
    nextCursor: page.nextCursor as string | undefined,
    windowEnd: page.windowEnd,
  }
}
