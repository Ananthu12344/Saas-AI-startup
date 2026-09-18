export type JsonFetch = (
  path: string,
  query?: Record<string, string | number | Array<string> | undefined>,
  signal?: AbortSignal
) => Promise<unknown>

export class ProviderTransportError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ProviderTransportError"
    this.status = status
  }
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>

type JsonFetcherOptions = {
  authHeader?: "authorization" | "x-api-key"
  extraHeaders?: Record<string, string>
}

function validateBaseUrl(baseUrl: string) {
  const parsed = new URL(baseUrl)
  if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1")
    throw new Error("Provider base URL must use HTTPS")
  if (!parsed.pathname.endsWith("/")) parsed.pathname += "/"
  return parsed
}

/**
 * Server-only transport. Provider adapters own response parsing; this helper
 * only enforces safe URL construction, authentication headers, and bounded
 * error semantics without ever including the credential in an error message.
 */
export function createJsonFetcher(
  baseUrl: string,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
  timeoutMs = 15_000,
  options: JsonFetcherOptions = {}
): JsonFetch {
  const origin = validateBaseUrl(baseUrl)
  if (!apiKey) throw new Error("Provider API key is required")
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1)
    throw new Error("Provider timeout must be a positive integer")

  return async (path, query = {}, signal) => {
    const url = new URL(path, origin)
    if (url.origin !== origin.origin)
      throw new Error("Provider request escaped the configured origin")
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, item)
      } else url.searchParams.set(key, String(value))
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const abortFromCaller = () => controller.abort()
    if (signal?.aborted) controller.abort()
    else signal?.addEventListener("abort", abortFromCaller, { once: true })

    let response: Response
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(options.extraHeaders ?? {}),
          [options.authHeader === "x-api-key" ? "x-api-key" : "Authorization"]:
            options.authHeader === "x-api-key" ? apiKey : `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      })
    } catch {
      if (controller.signal.aborted && !signal?.aborted)
        throw new ProviderTransportError("Provider request timed out", 408)
      throw new ProviderTransportError("Provider request failed", 0)
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", abortFromCaller)
    }

    if (!response.ok)
      throw new ProviderTransportError(
        `Provider request returned HTTP ${response.status}`,
        response.status
      )
    try {
      return await response.json()
    } catch {
      throw new ProviderTransportError("Provider returned invalid JSON", 200)
    }
  }
}
