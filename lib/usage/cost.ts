export type TokenUsage = {
  input: number
  output: number
  cachedInput?: number
  reasoning?: number
}

export type TokenRates = {
  inputPerMillion: number
  outputPerMillion: number
  cachedInputPerMillion?: number
  reasoningPerMillion?: number
}

export function calculateUsageCost(usage: TokenUsage, rates: TokenRates) {
  const input = Math.max(usage.input - (usage.cachedInput ?? 0), 0)
  const cachedInput = Math.min(usage.input, usage.cachedInput ?? 0)

  return (
    (input * rates.inputPerMillion) / 1_000_000 +
    (usage.output * rates.outputPerMillion) / 1_000_000 +
    (cachedInput * (rates.cachedInputPerMillion ?? rates.inputPerMillion)) /
      1_000_000 +
    ((usage.reasoning ?? 0) * (rates.reasoningPerMillion ?? 0)) / 1_000_000
  )
}
