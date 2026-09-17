import test from "node:test"
import assert from "node:assert/strict"
import { dashboardSummary } from "../../lib/dashboard/summary.ts"
import { readAllRows } from "../../lib/dashboard/pagination.ts"

const now = new Date("2026-09-17T23:30:00Z")
const budget = (id, extra = {}) => ({
  id,
  scope_type: "workspace",
  period_start: "2026-09-01T00:00:00Z",
  period_end: "2026-10-01T00:00:00Z",
  amount: 30,
  consumed_ratio: 0.5,
  ...extra,
})
test("UTC month excludes previous months and future dates", () => {
  const daily = [
    { day: "2026-08-31", total_cost: 100, total_tokens: 1000 },
    { day: "2026-09-01", total_cost: 2, total_tokens: 20 },
    { day: "2026-09-17", total_cost: 3, total_tokens: 30 },
    { day: "2026-09-18", total_cost: 200, total_tokens: 2000 },
  ]
  const result = dashboardSummary(daily, [], now)
  assert.equal(result.monthCost, 5)
  assert.equal(result.monthTokens, 50)
  assert.equal(result.todayCost, 3)
  assert.equal(result.latestMonthDay, "2026-09-17")
})
test("workspace budget excludes expired, future and project budgets", () => {
  const result = dashboardSummary(
    [],
    [
      budget("expired", { period_end: now.toISOString() }),
      budget("future", { period_start: "2026-09-18T00:00:00Z" }),
      budget("project", { scope_type: "project" }),
      budget("current"),
    ],
    now
  )
  assert.equal(result.workspaceBudget.id, "current")
  assert.equal(result.activeBudgets.length, 2)
})
test("overlapping workspace budgets are not arbitrarily selected", () => {
  const result = dashboardSummary([], [budget("one"), budget("two")], now)
  assert.equal(result.workspaceBudget, null)
  assert.equal(result.workspaceBudgetCount, 2)
})
test("no usage and no budget is an empty state", () => {
  const result = dashboardSummary([], [], now)
  assert.equal(result.todayCost, 0)
  assert.equal(result.monthCost, 0)
  assert.equal(result.latestMonthDay, "")
  assert.equal(result.workspaceBudget, null)
})
test("pagination includes all rows beyond the API limit", async () => {
  const fixture = Array.from({ length: 1201 }, (_, i) => i)
  const rows = await readAllRows(async (from, to) => ({
    rows: fixture.slice(from, to + 1),
    count: fixture.length,
  }))
  assert.deepEqual(rows, fixture)
})
test("empty page before total is reached fails instead of undercounting", async () => {
  await assert.rejects(
    readAllRows(async () => ({ rows: [], count: 2 })),
    /incomplete/
  )
})
test("changing count fails instead of silently mixing pages", async () => {
  let calls = 0
  await assert.rejects(
    readAllRows(async () => ({ rows: [1], count: ++calls === 1 ? 2 : 3 }), 1),
    /changed/
  )
})
test("oversized reports fail instead of exhausting resources", async () => {
  await assert.rejects(
    readAllRows(async () => ({ rows: [], count: 10001 })),
    /limits/
  )
})
