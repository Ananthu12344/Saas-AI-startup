import assert from "node:assert/strict"
import test from "node:test"
import { budgetState, budgetStateLabel } from "../../lib/dashboard/budgets.ts"

test("classifies budget consumption against its configured threshold", () => {
  assert.equal(budgetState(0.49, 0.8), "healthy")
  assert.equal(budgetState(0.8, 0.8), "approaching")
  assert.equal(budgetState(1, 0.8), "exceeded")
  assert.equal(budgetState(null, 0.8), "unavailable")
})

test("uses safe labels for dashboard presentation", () => {
  assert.equal(budgetStateLabel("healthy"), "Within budget")
  assert.equal(budgetStateLabel("approaching"), "Approaching threshold")
  assert.equal(budgetStateLabel("exceeded"), "Budget exceeded")
  assert.equal(budgetStateLabel("unavailable"), "Consumption unavailable")
})
