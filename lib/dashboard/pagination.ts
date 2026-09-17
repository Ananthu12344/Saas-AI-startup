// Stable ordering is supplied by the caller. Never publish a truncated total.
export async function readAllRows<T>(
  readPage: (from: number, to: number) => Promise<{ rows: T[]; count: number }>,
  pageSize = 500,
  maxRows = 10000
): Promise<T[]> {
  const rows: T[] = []
  let expectedCount: number | undefined
  while (true) {
    const page = await readPage(rows.length, rows.length + pageSize - 1)
    if (
      !Number.isSafeInteger(page.count) ||
      page.count < 0 ||
      page.count > maxRows
    ) {
      throw new Error("Dashboard result exceeds supported limits")
    }
    if (expectedCount !== undefined && expectedCount !== page.count) {
      throw new Error("Dashboard data changed during loading; retry")
    }
    expectedCount = page.count
    rows.push(...page.rows)
    if (rows.length === expectedCount) return rows
    if (rows.length > expectedCount || page.rows.length === 0) {
      throw new Error("Dashboard result is incomplete")
    }
  }
}
