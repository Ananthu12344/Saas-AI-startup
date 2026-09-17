import type { ProviderAdapter, UsageWindow } from "@/lib/providers/types"
import type { IngestionContext } from "./ingest"

export type SyncCheckpoint = {
  cursor?: string | null
  windowStart?: string | null
  windowEnd?: string | null
}

export type SyncDependencies = {
  loadCheckpoint: () => Promise<SyncCheckpoint | null>
  saveCheckpoint: (checkpoint: SyncCheckpoint) => Promise<void>
  ingestPage: (
    events: ReturnType<ProviderAdapter["normalizeUsage"]>[],
    context: IngestionContext
  ) => Promise<{ inserted: number }>
}

export async function syncProviderUsage(
  adapter: ProviderAdapter,
  context: IngestionContext,
  window: Omit<UsageWindow, "cursor">,
  dependencies: SyncDependencies,
  maxPages = 100
) {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000)
    throw new Error("Invalid sync page limit")
  const checkpoint = await dependencies.loadCheckpoint()
  let cursor = checkpoint?.cursor ?? undefined
  let pages = 0
  let events = 0
  let inserted = 0

  await adapter.validateCredential()
  while (pages < maxPages) {
    const page = await adapter.fetchUsage({ ...window, cursor })
    const normalized = page.records.map((record) =>
      adapter.normalizeUsage(record)
    )
    const result = await dependencies.ingestPage(normalized, context)
    pages += 1
    events += normalized.length
    inserted += result.inserted
    cursor = page.nextCursor
    await dependencies.saveCheckpoint({
      cursor: cursor ?? null,
      windowStart: window.start,
      windowEnd: page.windowEnd,
    })
    if (!cursor) return { pages, events, inserted, windowEnd: page.windowEnd }
  }
  throw new Error("Provider sync exceeded the page limit")
}
