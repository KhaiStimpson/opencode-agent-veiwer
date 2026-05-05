// ---------------------------------------------------------------------------
// Per-token pricing table (GitHub Copilot, May 2026)
// Source: https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing
// All prices in USD per 1 million tokens.
// ---------------------------------------------------------------------------

export interface ModelPricing {
  /** Input tokens (fresh, non-cached) */
  input: number;
  /** Cached input tokens */
  cachedInput: number;
  /** Cache write tokens (Anthropic only; undefined for other providers) */
  cacheWrite?: number;
  /** Output tokens */
  output: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI
  "gpt-4.1": { input: 2.0, cachedInput: 0.5, output: 8.0 },
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2.0 },
  "gpt-5.2": { input: 1.75, cachedInput: 0.175, output: 14.0 },
  "gpt-5.2-codex": { input: 1.75, cachedInput: 0.175, output: 14.0 },
  "gpt-5.3-codex": { input: 1.75, cachedInput: 0.175, output: 14.0 },
  "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15.0 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
  "gpt-5.4-nano": { input: 0.2, cachedInput: 0.02, output: 1.25 },
  "gpt-5.5": { input: 5.0, cachedInput: 0.5, output: 30.0 },
  // Anthropic (cache write billed separately)
  "claude-haiku-4.5": { input: 1.0, cachedInput: 0.1, cacheWrite: 1.25, output: 5.0 },
  "claude-sonnet-4": { input: 3.0, cachedInput: 0.3, cacheWrite: 3.75, output: 15.0 },
  "claude-sonnet-4.5": { input: 3.0, cachedInput: 0.3, cacheWrite: 3.75, output: 15.0 },
  "claude-sonnet-4.6": { input: 3.0, cachedInput: 0.3, cacheWrite: 3.75, output: 15.0 },
  "claude-opus-4.5": { input: 5.0, cachedInput: 0.5, cacheWrite: 6.25, output: 25.0 },
  "claude-opus-4.6": { input: 5.0, cachedInput: 0.5, cacheWrite: 6.25, output: 25.0 },
  "claude-opus-4.7": { input: 5.0, cachedInput: 0.5, cacheWrite: 6.25, output: 25.0 },
  // Google
  "gemini-2.5-pro": { input: 1.25, cachedInput: 0.125, output: 10.0 },
  "gemini-3-flash": { input: 0.5, cachedInput: 0.05, output: 3.0 },
  "gemini-3.1-pro": { input: 2.0, cachedInput: 0.2, output: 12.0 },
  // xAI
  "grok-code-fast-1": { input: 0.2, cachedInput: 0.02, output: 1.5 },
  // Fine-tuned (GitHub)
  "raptor-mini": { input: 0.25, cachedInput: 0.025, output: 2.0 },
  "goldeneye": { input: 1.25, cachedInput: 0.125, output: 10.0 },
};

/**
 * Returns pricing for a model, stripping provider prefixes and trying
 * progressively shorter suffixes until a match is found.
 */
export function getModelPricing(modelID: string): ModelPricing | null {
  const raw = modelID.toLowerCase().trim();
  const withoutPrefix = raw.includes("/") ? raw.split("/").pop()! : raw;

  if (withoutPrefix in MODEL_PRICING) return MODEL_PRICING[withoutPrefix];

  const segments = withoutPrefix.split("-");
  for (let len = segments.length - 1; len >= 2; len--) {
    const candidate = segments.slice(0, len).join("-");
    if (candidate in MODEL_PRICING) return MODEL_PRICING[candidate];
  }

  return null;
}

export function estimateCostFromPricing(
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number },
  pricing: ModelPricing,
): number {
  const M = 1_000_000;
  return (
    (tokens.input / M) * pricing.input +
    (tokens.output / M) * pricing.output +
    (tokens.cacheRead / M) * pricing.cachedInput +
    (tokens.cacheWrite / M) * (pricing.cacheWrite ?? pricing.cachedInput)
  );
}
