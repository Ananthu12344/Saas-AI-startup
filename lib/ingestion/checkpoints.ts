import type { SupabaseClient } from "@supabase/supabase-js"
import type { SyncCheckpoint } from "./sync"

export type CheckpointIdentity = {
  workspaceId: string
  providerId: string
  credentialId: string
}

/**
 * Persistent checkpoint storage for trusted provider workers. The table has a
 * uniqueness boundary per workspace, provider, and credential, so retries
 * update one checkpoint instead of creating competing cursors.
 */
export function createCheckpointStore(
  supabase: SupabaseClient,
  identity: CheckpointIdentity
) {
  const key = {
    workspace_id: identity.workspaceId,
    provider_id: identity.providerId,
    credential_id: identity.credentialId,
  }

  return {
    async loadCheckpoint(): Promise<SyncCheckpoint | null> {
      const { data, error } = await supabase
        .from("ingestion_checkpoints")
        .select("cursor,window_start,window_end")
        .match(key)
        .maybeSingle()
      if (error) throw new Error("Unable to load ingestion checkpoint")
      if (!data) return null
      return {
        cursor: data.cursor,
        windowStart: data.window_start,
        windowEnd: data.window_end,
      }
    },

    async saveCheckpoint(checkpoint: SyncCheckpoint): Promise<void> {
      const { error } = await supabase.from("ingestion_checkpoints").upsert(
        {
          ...key,
          cursor: checkpoint.cursor ?? null,
          window_start: checkpoint.windowStart ?? null,
          window_end: checkpoint.windowEnd ?? null,
          last_success_at: new Date().toISOString(),
          last_error: null,
        },
        { onConflict: "workspace_id,provider_id,credential_id" }
      )
      if (error) throw new Error("Unable to save ingestion checkpoint")
    },
  }
}
