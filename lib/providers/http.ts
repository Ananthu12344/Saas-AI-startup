export type JsonFetch = (
  path: string,
  query?: Record<string, string | number | undefined>,
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
  fetchImpl: FetchLike = fetch
): JsonFetch {
  const origin = validateBaseUrl(baseUrl)
  if (!apiKey) throw new Error("Provider API key is required")

  return async (path, query = {}, signal) => {
    const url = new URL(path, origin)
    if (url.origin !== origin.origin)
      throw new Error("Provider request escaped the configured origin")
    for (const [key, value] of Object.entries(query))
      if (value !== undefined) url.searchParams.set(key, String(value))

    let response: Response
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal,
      })
    } catch {
      throw new ProviderTransportError("Provider request failed", 0)
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
