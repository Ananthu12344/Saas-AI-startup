import type {
  NormalizedUsageEvent,
  ProviderAdapter,
  ProviderUsagePage,
  ProviderUsageRecord,
  UsageWindow,
} from "./types"

/**
 * OpenAI-specific behavior lives behind this boundary. Network transport and
 * credentials are intentionally injected so browser code cannot instantiate
 * this adapter or accidentally expose a provider key.
 */
export class OpenAIAdapter implements ProviderAdapter {
  readonly provider = "openai" as const
  private readonly fetchPage: (
    window: UsageWindow,
    cursor?: string
  ) => Promise<ProviderUsagePage>
  private readonly validate: () => Promise<void>
  readonly capabilities = {
    accountUsage: true,
    projectUsage: true,
    requestIds: true,
    cachedTokens: true,
    reasoningTokens: true,
    historicalUsage: true,
    modelPricing: false,
  }

  constructor(
    fetchPage: (
      window: UsageWindow,
      cursor?: string
    ) => Promise<ProviderUsagePage>,
    validate: () => Promise<void>
  ) {
    this.fetchPage = fetchPage
    this.validate = validate
  }

  validateCredential() {
    return this.validate()
  }

  fetchUsage(window: UsageWindow) {
    return this.fetchPage(window, window.cursor)
  }

  normalizeUsage(record: ProviderUsageRecord): NormalizedUsageEvent {
    const idempotencyKey = record.providerRequestId
      ? `openai:${record.providerRequestId}`
      : [
          "openai",
          record.model,
          record.occurredAt,
          record.inputTokens ?? 0,
          record.outputTokens ?? 0,
        ].join(":")

    return {
      ...record,
      provider: this.provider,
      ingestionSource: "provider_poll",
      idempotencyKey,
      costStatus: record.cost === undefined ? "unknown" : "actual",
    }
  }
}
