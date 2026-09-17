export type DailyUsage = {
  day: string
  total_cost: number
  total_tokens: number
}
export type Budget = {
  id: string
  scope_type: string
  period_start: string
  period_end: string
  amount: number
  consumed_ratio: number | null
}

export function dashboardSummary<T extends Budget>(
  daily: DailyUsage[],
  budgets: T[],
  now: Date
) {
  const today = now.toISOString().slice(0, 10)
  const month = today.slice(0, 7)
  const monthRows = daily.filter(
    (row) => row.day.startsWith(month) && row.day <= today
  )
  const activeBudgets = budgets.filter(
    (budget) =>
      Date.parse(budget.period_start) <= now.getTime() &&
      now.getTime() < Date.parse(budget.period_end)
  )
  const workspaceBudgets = activeBudgets.filter(
    (budget) => budget.scope_type === "workspace"
  )
  return {
    monthCost: monthRows.reduce((sum, row) => sum + row.total_cost, 0),
    monthTokens: monthRows.reduce((sum, row) => sum + row.total_tokens, 0),
    todayCost: daily.find((row) => row.day === today)?.total_cost ?? 0,
    latestMonthDay: monthRows.reduce(
      (latest, row) => (row.day > latest ? row.day : latest),
      ""
    ),
    activeBudgets,
    // Overlapping workspace budgets are distinct; do not arbitrarily pick one.
    workspaceBudget: workspaceBudgets.length === 1 ? workspaceBudgets[0] : null,
    workspaceBudgetCount: workspaceBudgets.length,
  }
}
