import type { SupabaseClient } from "@supabase/supabase-js"
import { createCheckpointStore } from "./checkpoints.ts"
import { ingestUsagePage, type IngestionContext } from "./ingest.ts"
import { syncProviderUsage } from "./sync.ts"
import type {
  ProviderAdapter,
  ProviderSlug,
  UsageWindow,
} from "../providers/types"
import {
  applyPricing,
  selectPricingVersion,
  type PricingVersion,
} from "../usage/pricing.ts"

export type ProviderSyncOptions = {
  supabase: SupabaseClient
  adapter: ProviderAdapter
  provider: ProviderSlug
  providerId: string
  credentialId: string
  context: IngestionContext
  window: Omit<UsageWindow, "cursor">
  pricingByModel?: Record<string, PricingVersion[]>
}

/**
 * Trusted worker composition for one provider credential. Callers should
 * construct this only after resolving credentials and creating the adapter in
 * server-only code.
 */
export function runProviderSync(options: ProviderSyncOptions) {
  const checkpoints = createCheckpointStore(options.supabase, {
    workspaceId: options.context.workspaceId,
    providerId: options.providerId,
    credentialId: options.credentialId,
  })
  return syncProviderUsage(options.adapter, options.context, options.window, {
    ...checkpoints,
    priceEvent: (event) => {
      const versions = options.pricingByModel?.[event.model] ?? []
      return applyPricing(
        event,
        selectPricingVersion(versions, event.occurredAt)
      )
    },
    ingestPage: (events, context) =>
      ingestUsagePage(options.supabase, options.provider, events, context),
  })
}
