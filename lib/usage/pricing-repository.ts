import type { SupabaseClient } from "@supabase/supabase-js"
import type { PricingVersion } from "./pricing"

const numeric = (value: unknown, field: string) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new Error(`Invalid pricing ${field}`)
  return parsed
}

/** Load trusted, effective-dated pricing for one enabled provider model. */
export async function loadPricingVersions(
  supabase: SupabaseClient,
  providerSlug: string,
  providerModel: string
): Promise<PricingVersion[]> {
  const provider = await supabase
    .from("ai_providers")
    .select("id")
    .eq("slug", providerSlug)
    .eq("enabled", true)
    .maybeSingle()
  if (provider.error) throw new Error("Unable to load provider pricing")
  if (!provider.data) return []

  const model = await supabase
    .from("provider_models")
    .select("id")
    .eq("provider_id", provider.data.id)
    .eq("provider_model", providerModel)
    .eq("enabled", true)
    .maybeSingle()
  if (model.error) throw new Error("Unable to load provider pricing")
  if (!model.data) return []
  const providerModelId = model.data.id

  const prices = await supabase
    .from("model_pricing_versions")
    .select(
      "effective_from,effective_to,currency,input_cost_per_million,output_cost_per_million,cached_input_cost_per_million,reasoning_cost_per_million"
    )
    .eq("provider_model_id", providerModelId)
    .order("effective_from", { ascending: true })
  if (prices.error) throw new Error("Unable to load provider pricing")

  return (prices.data ?? []).map((row) => {
    if (
      typeof row.effective_from !== "string" ||
      typeof row.currency !== "string" ||
      !/^[A-Z]{3}$/.test(row.currency)
    )
      throw new Error("Invalid pricing identity")
    return {
      providerModelId,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      currency: row.currency,
      inputCostPerMillion: numeric(row.input_cost_per_million, "input rate"),
      outputCostPerMillion: numeric(row.output_cost_per_million, "output rate"),
      cachedInputCostPerMillion:
        row.cached_input_cost_per_million === null
          ? null
          : numeric(row.cached_input_cost_per_million, "cached rate"),
      reasoningCostPerMillion:
        row.reasoning_cost_per_million === null
          ? null
          : numeric(row.reasoning_cost_per_million, "reasoning rate"),
    }
  })
}
