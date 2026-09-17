export type ProviderSlug = "openai" | "anthropic" | "gemini" | "openrouter"

export type ProviderCapabilities = {
  accountUsage: boolean
  projectUsage: boolean
  requestIds: boolean
  cachedTokens: boolean
  reasoningTokens: boolean
  historicalUsage: boolean
  modelPricing: boolean
}

export type UsageWindow = {
  start: string
  end: string
  cursor?: string
}

export type ProviderUsageRecord = {
  providerRequestId?: string
  model: string
  occurredAt: string
  inputTokens?: number
  outputTokens?: number
  cachedInputTokens?: number
  reasoningTokens?: number
  cost?: number
  currency?: string
  status?: "succeeded" | "failed" | "cancelled" | "unknown"
  latencyMs?: number
  metadata?: Record<string, unknown>
}

export type NormalizedUsageEvent = ProviderUsageRecord & {
  provider: ProviderSlug
  ingestionSource: "provider_poll" | "sdk" | "gateway" | "manual"
  idempotencyKey: string
  costStatus: "actual" | "estimated" | "unknown"
}

export type ProviderUsagePage = {
  records: ProviderUsageRecord[]
  nextCursor?: string
  windowEnd: string
}

export interface ProviderAdapter {
  readonly provider: ProviderSlug
  readonly capabilities: ProviderCapabilities
  validateCredential(): Promise<void>
  fetchUsage(window: UsageWindow): Promise<ProviderUsagePage>
  normalizeUsage(record: ProviderUsageRecord): NormalizedUsageEvent
}
