import { createJsonFetcher, type JsonFetch } from "./http.ts"
import { AnthropicAdapter } from "./anthropic.ts"
import type { ProviderUsagePage, UsageWindow } from "./types"

export class AnthropicUsageParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AnthropicUsageParseError"
  }
}

function count(value: unknown, field: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new AnthropicUsageParseError(`Missing or invalid ${field}`)
  return value as number
}

function optionalCount(value: unknown, field: string) {
  if (value === undefined || value === null) return undefined
  return count(value, field)
}

function timestamp(value: unknown, field: string) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    throw new AnthropicUsageParseError(`Missing or invalid ${field}`)
  return new Date(value).toISOString()
}

/** Parse Anthropic's organization messages usage report. */
export function parseAnthropicMessagesPage(
  payload: unknown,
  requestedWindow: Omit<UsageWindow, "cursor">
): ProviderUsagePage {
  if (!payload || typeof payload !== "object")
    throw new AnthropicUsageParseError("Anthropic usage response is not an object")
  const page = payload as Record<string, unknown>
  if (!Array.isArray(page.data))
    throw new AnthropicUsageParseError("Anthropic usage response is missing data")
  if (typeof page.has_more !== "boolean")
    throw new AnthropicUsageParseError("Anthropic usage response is missing has_more")
  if (
    page.next_page !== undefined &&
    page.next_page !== null &&
    typeof page.next_page !== "string"
  )
    throw new AnthropicUsageParseError("Anthropic usage response has an invalid page cursor")
  if (page.has_more && typeof page.next_page !== "string")
    throw new AnthropicUsageParseError("Anthropic usage response is missing next_page")
  if (!page.has_more && page.next_page !== undefined && page.next_page !== null)
    throw new AnthropicUsageParseError("Anthropic usage response has a cursor without has_more")

  let latestEnd = Date.parse(requestedWindow.end)
  const records = []
  for (const bucketValue of page.data) {
    if (!bucketValue || typeof bucketValue !== "object")
      throw new AnthropicUsageParseError("Anthropic usage bucket is invalid")
    const bucket = bucketValue as Record<string, unknown>
    const occurredAt = timestamp(bucket.starting_at, "bucket starting_at")
    const endAt = timestamp(bucket.ending_at, "bucket ending_at")
    latestEnd = Math.max(latestEnd, Date.parse(endAt))
    if (!Array.isArray(bucket.results))
      throw new AnthropicUsageParseError("Anthropic usage bucket is missing results")
    for (const resultValue of bucket.results) {
      if (!resultValue || typeof resultValue !== "object")
        throw new AnthropicUsageParseError("Anthropic usage result is invalid")
      const result = resultValue as Record<string, unknown>
      if (typeof result.model !== "string" || !result.model.trim())
        throw new AnthropicUsageParseError("Anthropic usage result is missing model; request group_by[]=model")
      const cacheCreation = result.cache_creation
      if (cacheCreation !== undefined && cacheCreation !== null && typeof cacheCreation !== "object")
        throw new AnthropicUsageParseError("Anthropic cache_creation is invalid")
      records.push({
        model: result.model,
        occurredAt,
        inputTokens: count(result.uncached_input_tokens, "uncached_input_tokens"),
        outputTokens: count(result.output_tokens, "output_tokens"),
        cachedInputTokens: optionalCount(result.cache_read_input_tokens, "cache_read_input_tokens"),
        metadata: {
          apiKeyId: result.api_key_id ?? null,
          workspaceId: result.workspace_id ?? null,
          serviceTier: result.service_tier ?? null,
          contextWindow: result.context_window ?? null,
          cacheCreation: cacheCreation ?? null,
          serverToolUse: result.server_tool_use ?? null,
        },
      })
    }
  }
  if (!Number.isFinite(latestEnd))
    throw new AnthropicUsageParseError("Anthropic usage response has invalid window")
  return {
    records,
    nextCursor: page.next_page === null ? undefined : (page.next_page as string | undefined),
    windowEnd: new Date(latestEnd).toISOString(),
  }
}

export type AnthropicAdapterOptions = {
  apiKey: string
  validateCredential: () => Promise<void>
  baseUrl?: string
  fetchImpl?: Parameters<typeof createJsonFetcher>[2]
  timeoutMs?: number
}

export function createAnthropicAdapter(options: AnthropicAdapterOptions) {
  const fetchJson: JsonFetch = createJsonFetcher(
    options.baseUrl ?? "https://api.anthropic.com/v1/",
    options.apiKey,
    options.fetchImpl,
    options.timeoutMs,
    { authHeader: "x-api-key", extraHeaders: { "anthropic-version": "2023-06-01" } }
  )
  return new AnthropicAdapter(async (window) => {
    const start = new Date(window.start)
    const end = new Date(window.end)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start)
      throw new AnthropicUsageParseError("Invalid usage window")
    const payload = await fetchJson("organizations/usage_report/messages", {
      starting_at: start.toISOString(),
      ending_at: end.toISOString(),
      bucket_width: "1d",
      "group_by[]": ["model"],
      page: window.cursor,
    })
    return parseAnthropicMessagesPage(payload, window)
  }, options.validateCredential)
}
