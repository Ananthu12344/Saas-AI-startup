import type {
  NormalizedUsageEvent,
  ProviderAdapter,
  ProviderUsagePage,
  ProviderUsageRecord,
  UsageWindow,
} from "./types"
import { validateProviderUsagePage } from "./validation.ts"

export class AnthropicAdapter implements ProviderAdapter {
  readonly provider = "anthropic" as const
  readonly capabilities = {
    accountUsage: true,
    projectUsage: true,
    requestIds: false,
    cachedTokens: true,
    reasoningTokens: false,
    historicalUsage: true,
    modelPricing: false,
  }
  private readonly fetchPage: (window: UsageWindow) => Promise<ProviderUsagePage>
  private readonly validate: () => Promise<void>

  constructor(
    fetchPage: (window: UsageWindow) => Promise<ProviderUsagePage>,
    validate: () => Promise<void>
  ) {
    this.fetchPage = fetchPage
    this.validate = validate
  }

  validateCredential() {
    return this.validate()
  }

  fetchUsage(window: UsageWindow) {
    return this.fetchPage(window).then(validateProviderUsagePage)
  }

  normalizeUsage(record: ProviderUsageRecord): NormalizedUsageEvent {
    const dimensions = [
      record.metadata?.apiKeyId,
      record.metadata?.workspaceId,
      record.metadata?.serviceTier,
      record.metadata?.contextWindow,
    ]
    const suffix = dimensions.some((value) => value !== undefined)
      ? ":" + dimensions.map((value) => value ?? "").join(":")
      : ""
    const idempotencyKey = [
      "anthropic",
      record.model,
      record.occurredAt,
      record.inputTokens ?? 0,
      record.outputTokens ?? 0,
      record.cachedInputTokens ?? 0,
    ].join(":") + suffix
    return {
      ...record,
      provider: this.provider,
      ingestionSource: "provider_poll",
      idempotencyKey,
      costStatus: "unknown",
    }
  }
}
