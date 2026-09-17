import { calculateUsageCost } from "./cost.ts"
import type { NormalizedUsageEvent } from "../providers/types.ts"

export type PricingVersion = {
  providerModelId: string
  effectiveFrom: string
  effectiveTo?: string | null
  currency: string
  inputCostPerMillion: number
  outputCostPerMillion: number
  cachedInputCostPerMillion?: number | null
  reasoningCostPerMillion?: number | null
}

function effectiveAt(version: PricingVersion, occurredAt: Date) {
  const start = new Date(version.effectiveFrom).getTime()
  const end = version.effectiveTo
    ? new Date(version.effectiveTo).getTime()
    : Infinity
  return (
    Number.isFinite(start) &&
    start <= occurredAt.getTime() &&
    occurredAt.getTime() < end
  )
}

export function selectPricingVersion(
  versions: PricingVersion[],
  occurredAt: string
) {
  const date = new Date(occurredAt)
  if (Number.isNaN(date.getTime())) throw new Error("Invalid usage timestamp")
  const matches = versions.filter((version) => effectiveAt(version, date))
  if (matches.length > 1) throw new Error("Overlapping pricing versions")
  return matches[0]
}

export function applyPricing(
  event: NormalizedUsageEvent,
  pricing: PricingVersion | undefined
): NormalizedUsageEvent {
  if (event.cost !== undefined) return event
  if (!pricing) return { ...event, costStatus: "unknown" }
  const cost = calculateUsageCost(
    {
      input: event.inputTokens ?? 0,
      output: event.outputTokens ?? 0,
      cachedInput: event.cachedInputTokens ?? 0,
      reasoning: event.reasoningTokens ?? 0,
    },
    {
      inputPerMillion: pricing.inputCostPerMillion,
      outputPerMillion: pricing.outputCostPerMillion,
      cachedInputPerMillion: pricing.cachedInputCostPerMillion ?? undefined,
      reasoningPerMillion: pricing.reasoningCostPerMillion ?? undefined,
    }
  )
  return { ...event, cost, currency: pricing.currency, costStatus: "estimated" }
}
