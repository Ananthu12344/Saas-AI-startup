import { createJsonFetcher, type JsonFetch } from "./http.ts"
import { OpenAIAdapter } from "./openai.ts"
import type { ProviderUsagePage, UsageWindow } from "./types"

export class OpenAIUsageParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OpenAIUsageParseError"
  }
}

function requiredCount(value: unknown, field: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new OpenAIUsageParseError(`Missing or invalid ${field}`)
  return value as number
}

function timestamp(value: unknown, field: string) {
  const seconds = requiredCount(value, field)
  const date = new Date(seconds * 1000)
  if (Number.isNaN(date.getTime()))
    throw new OpenAIUsageParseError(`Invalid ${field}`)
  return date.toISOString()
}

function optionalCount(value: unknown, field: string) {
  if (value === undefined || value === null) return undefined
  return requiredCount(value, field)
}

/** Parse the documented OpenAI organization completions usage response. */
export function parseOpenAICompletionsPage(
  payload: unknown,
  requestedWindow: Omit<UsageWindow, "cursor">
): ProviderUsagePage {
  if (!payload || typeof payload !== "object")
    throw new OpenAIUsageParseError("OpenAI usage response is not an object")
  const page = payload as Record<string, unknown>
  if (!Array.isArray(page.data))
    throw new OpenAIUsageParseError("OpenAI usage response is missing data")
  if (typeof page.has_more !== "boolean")
    throw new OpenAIUsageParseError("OpenAI usage response is missing has_more")
  if (
    page.next_page !== undefined &&
    page.next_page !== null &&
    typeof page.next_page !== "string"
  )
    throw new OpenAIUsageParseError(
      "OpenAI usage response has an invalid page cursor"
    )
  if (page.has_more && typeof page.next_page !== "string")
    throw new OpenAIUsageParseError(
      "OpenAI usage response is missing next_page for a paginated result"
    )
  if (!page.has_more && page.next_page !== undefined && page.next_page !== null)
    throw new OpenAIUsageParseError(
      "OpenAI usage response has a cursor without has_more"
    )

  const records = []
  let latestEnd = new Date(requestedWindow.end).getTime()
  for (const bucketValue of page.data) {
    if (!bucketValue || typeof bucketValue !== "object")
      throw new OpenAIUsageParseError("OpenAI usage bucket is invalid")
    const bucket = bucketValue as Record<string, unknown>
    const occurredAt = timestamp(bucket.start_time, "bucket start_time")
    const endAt = timestamp(bucket.end_time, "bucket end_time")
    latestEnd = Math.max(latestEnd, Date.parse(endAt))
    if (!Array.isArray(bucket.results))
      throw new OpenAIUsageParseError("OpenAI usage bucket is missing results")

    for (const resultValue of bucket.results) {
      if (!resultValue || typeof resultValue !== "object")
        throw new OpenAIUsageParseError("OpenAI usage result is invalid")
      const result = resultValue as Record<string, unknown>
      if (typeof result.model !== "string" || !result.model.trim())
        throw new OpenAIUsageParseError(
          "OpenAI usage result is missing model; request group_by=model"
        )
      for (const field of [
        "input_cache_write_tokens",
        "input_audio_tokens",
        "input_cached_audio_tokens",
        "input_cached_image_tokens",
        "input_cached_text_tokens",
        "input_image_tokens",
        "input_text_tokens",
        "input_uncached_tokens",
        "output_audio_tokens",
        "output_image_tokens",
        "output_text_tokens",
      ]) {
        const value = result[field]
        if (value !== undefined && value !== null && value !== 0)
          throw new OpenAIUsageParseError(
            `Unsupported non-zero usage field: ${field}`
          )
      }
      const metadata = {
        projectId: result.project_id ?? null,
        userId: result.user_id ?? null,
        apiKeyId: result.api_key_id ?? null,
        batch: result.batch ?? null,
        serviceTier: result.service_tier ?? null,
        requestCount: requiredCount(
          result.num_model_requests,
          "num_model_requests"
        ),
        cachedInputReported: result.input_cached_tokens !== undefined,
      }
      records.push({
        model: result.model,
        occurredAt,
        inputTokens: requiredCount(result.input_tokens, "input_tokens"),
        outputTokens: requiredCount(result.output_tokens, "output_tokens"),
        cachedInputTokens: optionalCount(
          result.input_cached_tokens,
          "input_cached_tokens"
        ),
        metadata,
      })
    }
  }

  if (!Number.isFinite(latestEnd))
    throw new OpenAIUsageParseError("OpenAI usage response has invalid window")
  return {
    records,
    nextCursor:
      page.next_page === null
        ? undefined
        : (page.next_page as string | undefined),
    windowEnd: new Date(latestEnd).toISOString(),
  }
}

export type OpenAIAdapterOptions = {
  apiKey: string
  validateCredential: () => Promise<void>
  baseUrl?: string
  fetchImpl?: Parameters<typeof createJsonFetcher>[2]
  timeoutMs?: number
}

export function createOpenAIAdapter(options: OpenAIAdapterOptions) {
  const fetchJson: JsonFetch = createJsonFetcher(
    options.baseUrl ?? "https://api.openai.com/v1/",
    options.apiKey,
    options.fetchImpl,
    options.timeoutMs
  )
  return new OpenAIAdapter(async (window) => {
    const startTime = Math.floor(Date.parse(window.start) / 1000)
    const endTime = Math.floor(Date.parse(window.end) / 1000)
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime))
      throw new OpenAIUsageParseError("Invalid usage window")
    const payload = await fetchJson("organization/usage/completions", {
      start_time: startTime,
      end_time: endTime,
      bucket_width: "1d",
      group_by: "model",
      page: window.cursor,
    })
    return parseOpenAICompletionsPage(payload, window)
  }, options.validateCredential)
}
