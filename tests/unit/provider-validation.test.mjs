import assert from "node:assert/strict"
import test from "node:test"
import { validateProviderUsagePage } from "../../lib/providers/validation.ts"

const valid = {
  records: [
    {
      model: "model-a",
      occurredAt: "2026-09-17T12:00:00Z",
      inputTokens: 10,
      outputTokens: 5,
      cost: 0.1,
      currency: "USD",
    },
  ],
  nextCursor: "next",
  windowEnd: "2026-09-17T13:00:00Z",
}

test("accepts a normalized provider page", () => {
  assert.deepEqual(validateProviderUsagePage(valid), valid)
})

test("rejects malformed page identity and cursors", () => {
  assert.throws(() => validateProviderUsagePage({ ...valid, records: {} }), {
    message: "Usage page is missing records",
  })
  assert.throws(() => validateProviderUsagePage({ ...valid, nextCursor: 5 }), {
    message: "Usage page has an invalid cursor",
  })
  assert.throws(
    () => validateProviderUsagePage({ ...valid, windowEnd: "bad" }),
    {
      message: "Usage page has an invalid window",
    }
  )
})

test("rejects malformed usage fields before ingestion", () => {
  for (const change of [
    { model: "" },
    { occurredAt: "bad" },
    { inputTokens: 1.5 },
    { outputTokens: -1 },
    { cost: Number.NaN },
    { currency: "usd" },
  ]) {
    assert.throws(
      () =>
        validateProviderUsagePage({
          ...valid,
          records: [{ ...valid.records[0], ...change }],
        }),
      /Usage record/
    )
  }
})
