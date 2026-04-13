import { useState, useEffect } from "react";
import type { OpencodeClient } from "../lib/opencode";

interface ModelLimits {
  context: number;
  output: number;
}

export interface UseProvidersResult {
  modelLimits: Map<string, ModelLimits>;
  loading: boolean;
}

/**
 * Fetches provider/model metadata once on connect and caches the
 * context window size (`limit.context`) and max output tokens
 * (`limit.output`) for each model, keyed by "providerID/modelID".
 *
 * A secondary key using just the modelID is stored as a fallback
 * so lookups work even when the caller only has the modelID.
 */
export function useProviders(
  client: OpencodeClient | null,
): UseProvidersResult {
  const [modelLimits, setModelLimits] = useState<Map<string, ModelLimits>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!client) {
      setModelLimits(new Map());
      return;
    }

    let cancelled = false;

    async function fetchProviders() {
      setLoading(true);
      try {
        const res = await client!.provider.list();
        if (cancelled) return;

        const limits = new Map<string, ModelLimits>();
        const providers = res.data?.all ?? [];

        for (const provider of providers) {
          if (!provider.models) continue;
          for (const [modelKey, model] of Object.entries(provider.models)) {
            if (!model.limit) continue;
            const entry: ModelLimits = {
              context: model.limit.context,
              output: model.limit.output,
            };
            // Primary key: providerID/modelID
            limits.set(`${provider.id}/${model.id}`, entry);
            // Also store by bare model ID and the map key
            limits.set(model.id, entry);
            if (modelKey !== model.id) {
              limits.set(modelKey, entry);
            }
          }
        }

        setModelLimits(limits);
      } catch {
        // Non-critical — UI degrades gracefully without limit data
        console.warn("[providers] Failed to fetch provider metadata");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchProviders();
    return () => {
      cancelled = true;
    };
  }, [client]);

  return { modelLimits, loading };
}

/**
 * Look up the context window limit for a given provider/model pair.
 * Falls back to modelID-only lookup, then returns null if not found.
 */
export function getModelLimits(
  modelLimits: Map<string, ModelLimits>,
  providerID: string,
  modelID: string,
): ModelLimits | null {
  return (
    modelLimits.get(`${providerID}/${modelID}`) ??
    modelLimits.get(modelID) ??
    null
  );
}
