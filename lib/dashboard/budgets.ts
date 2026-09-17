export type BudgetState = "healthy" | "approaching" | "exceeded" | "unavailable"

export function budgetState(
  consumedRatio: number | null,
  alertThreshold: number | null | undefined
): BudgetState {
  if (consumedRatio === null || !Number.isFinite(consumedRatio))
    return "unavailable"
  if (consumedRatio >= 1) return "exceeded"
  if (
    alertThreshold !== null &&
    alertThreshold !== undefined &&
    Number.isFinite(alertThreshold) &&
    consumedRatio >= alertThreshold
  )
    return "approaching"
  return "healthy"
}

export function budgetStateLabel(state: BudgetState) {
  switch (state) {
    case "approaching":
      return "Approaching threshold"
    case "exceeded":
      return "Budget exceeded"
    case "unavailable":
      return "Consumption unavailable"
    default:
      return "Within budget"
  }
}
