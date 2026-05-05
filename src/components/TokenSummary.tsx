import {
  Group,
  Text,
  Badge,
  Stack,
  Paper,
  Collapse,
  Table,
  Divider,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  Lightning,
  CaretDown,
  CaretRight,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import { formatTokens, formatCost } from "../lib/opencode";
import type { Message, Part, Session } from "../types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MessageWithParts {
  info: Message;
  parts: Part[];
}

interface TokenSummaryProps {
  messages: MessageWithParts[];
  session: Session | null;
}

// ---------------------------------------------------------------------------
// Model multiplier table (GitHub Copilot paid-plan rates, April 2026)
// Source: https://docs.github.com/en/copilot/concepts/billing/copilot-requests
// ---------------------------------------------------------------------------

const MODEL_MULTIPLIERS: Record<string, number> = {
  // Anthropic
  "claude-haiku-4.5": 0.33,
  "claude-opus-4.5": 3,
  "claude-opus-4.6": 3,
  "claude-sonnet-4": 1,
  "claude-sonnet-4.5": 1,
  "claude-sonnet-4.6": 1,
  // Google
  "gemini-2.5-pro": 1,
  "gemini-3-flash": 0.33,
  "gemini-3.1-pro": 1,
  // OpenAI — included on paid plans (0x)
  "gpt-4.1": 0,
  "gpt-4o": 0,
  "gpt-5-mini": 0,
  // OpenAI — premium
  "gpt-5.1": 1,
  "gpt-5.2": 1,
  "gpt-5.2-codex": 1,
  "gpt-5.3-codex": 1,
  "gpt-5.4": 1,
  "gpt-5.4-mini": 0.33,
  // xAI
  "grok-code-fast-1": 0.25,
  // Microsoft
  "raptor-mini": 0,
};

const DEFAULT_MULTIPLIER = 1;

// ---------------------------------------------------------------------------
// Per-token pricing table (GitHub Copilot, May 2026)
// Source: https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing
// All prices in USD per 1 million tokens.
// ---------------------------------------------------------------------------

interface ModelPricing {
  /** Input tokens (fresh, non-cached) */
  input: number;
  /** Cached input tokens */
  cachedInput: number;
  /** Cache write tokens (Anthropic only; undefined for other providers) */
  cacheWrite?: number;
  /** Output tokens */
  output: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
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
 * Returns pricing for a model, using the same normalisation logic as
 * getMultiplier (strip provider prefix, try progressively shorter suffixes).
 */
function getModelPricing(modelID: string): ModelPricing | null {
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

function estimateCostFromPricing(
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

/**
 * Normalise an SDK modelID to a key in MODEL_MULTIPLIERS.
 * The SDK may return IDs like "anthropic/claude-sonnet-4" or "claude-sonnet-4",
 * possibly with extra version suffixes. We strip prefixes and try progressively
 * shorter suffixes until we get a match.
 */
function getMultiplier(modelID: string): number {
  const raw = modelID.toLowerCase().trim();

  // Strip provider prefix (e.g. "anthropic/claude-sonnet-4" -> "claude-sonnet-4")
  const withoutPrefix = raw.includes("/") ? raw.split("/").pop()! : raw;

  // Direct match
  if (withoutPrefix in MODEL_MULTIPLIERS) return MODEL_MULTIPLIERS[withoutPrefix];

  // Try stripping trailing segments (e.g. "claude-sonnet-4-20250514" -> "claude-sonnet-4")
  const segments = withoutPrefix.split("-");
  for (let len = segments.length - 1; len >= 2; len--) {
    const candidate = segments.slice(0, len).join("-");
    if (candidate in MODEL_MULTIPLIERS) return MODEL_MULTIPLIERS[candidate];
  }

  return DEFAULT_MULTIPLIER;
}

function getDisplayName(modelID: string): string {
  // Strip provider prefix for display
  const raw = modelID.trim();
  return raw.includes("/") ? raw.split("/").pop()! : raw;
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

interface TokenTotals {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

interface ModelBreakdown {
  modelID: string;
  displayName: string;
  providerID: string;
  count: number;
  multiplier: number;
  weighted: number;
}

interface CompactionInfo {
  total: number;
  auto: number;
  manual: number;
}

interface PremiumRequestSummary {
  userPrompts: number;
  totalWeighted: number;
  byModel: ModelBreakdown[];
  compaction: CompactionInfo;
  compactionWeighted: number;
  grandTotalWeighted: number;
}

interface ModelTokenTotals {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

interface ModelTokenBreakdown {
  modelID: string;
  displayName: string;
  providerID: string;
  tokens: ModelTokenTotals;
  /** Estimated cost from MODEL_PRICING table (null when model is unknown) */
  estimatedCost: number | null;
  /** Actual cost as reported by the SDK */
  actualCost: number;
}

function aggregateTokens(messages: MessageWithParts[]): TokenTotals {
  const totals: TokenTotals = {
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
  };

  for (const { info } of messages) {
    if (info.role !== "assistant") continue;
    totals.input += info.tokens.input;
    totals.output += info.tokens.output;
    totals.reasoning += info.tokens.reasoning;
    totals.cacheRead += info.tokens.cache.read;
    totals.cacheWrite += info.tokens.cache.write;
    totals.cost += info.cost;
  }

  return totals;
}

function aggregateTokensByModel(messages: MessageWithParts[]): ModelTokenBreakdown[] {
  const modelMap = new Map<string, ModelTokenBreakdown>();

  for (const { info } of messages) {
    if (info.role !== "assistant") continue;

    const { modelID, providerID } = info;
    const key = `${providerID}/${modelID}`;

    if (!modelMap.has(key)) {
      modelMap.set(key, {
        modelID,
        displayName: getDisplayName(modelID),
        providerID,
        tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
        estimatedCost: null,
        actualCost: 0,
      });
    }

    const entry = modelMap.get(key)!;
    entry.tokens.input += info.tokens.input;
    entry.tokens.output += info.tokens.output;
    entry.tokens.reasoning += info.tokens.reasoning;
    entry.tokens.cacheRead += info.tokens.cache.read;
    entry.tokens.cacheWrite += info.tokens.cache.write;
    entry.actualCost += info.cost;
  }

  // Compute estimated costs from the pricing table
  for (const entry of modelMap.values()) {
    const pricing = getModelPricing(entry.modelID);
    if (pricing) {
      entry.estimatedCost = estimateCostFromPricing(
        {
          input: entry.tokens.input,
          output: entry.tokens.output,
          cacheRead: entry.tokens.cacheRead,
          cacheWrite: entry.tokens.cacheWrite,
        },
        pricing,
      );
    }
  }

  // Sort by total tokens descending
  return [...modelMap.values()].sort(
    (a, b) =>
      b.tokens.input + b.tokens.output - (a.tokens.input + a.tokens.output),
  );
}

function aggregatePremiumRequests(
  messages: MessageWithParts[],
  isSubagent: boolean,
): PremiumRequestSummary {
  // Subagent sessions do not count as premium requests — only user-initiated
  // prompts are billed. Return zeroed summary immediately.
  if (isSubagent) {
    return {
      userPrompts: 0,
      totalWeighted: 0,
      byModel: [],
      compaction: { total: 0, auto: 0, manual: 0 },
      compactionWeighted: 0,
      grandTotalWeighted: 0,
    };
  }

  // Count user prompts, grouped by the target model
  const modelMap = new Map<
    string,
    { providerID: string; count: number }
  >();
  let userPrompts = 0;

  for (const { info } of messages) {
    if (info.role !== "user") continue;
    userPrompts++;

    const modelID = info.model.modelID;
    const providerID = info.model.providerID;
    const key = `${providerID}/${modelID}`;

    const existing = modelMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      modelMap.set(key, { providerID, count: 1 });
    }
  }

  // Build per-model breakdown
  const byModel: ModelBreakdown[] = [];
  let totalWeighted = 0;

  for (const [key, { providerID, count }] of modelMap) {
    const modelID = key.includes("/") ? key.split("/").slice(1).join("/") : key;
    const multiplier = getMultiplier(modelID);
    const weighted = count * multiplier;
    totalWeighted += weighted;

    byModel.push({
      modelID,
      displayName: getDisplayName(modelID),
      providerID,
      count,
      multiplier,
      weighted,
    });
  }

  // Sort by weighted desc
  byModel.sort((a, b) => b.weighted - a.weighted);

  // Count compaction parts
  let compactionTotal = 0;
  let compactionAuto = 0;

  for (const { parts } of messages) {
    for (const part of parts) {
      if (part.type === "compaction") {
        compactionTotal++;
        if (part.auto) compactionAuto++;
      }
    }
  }

  // For compaction weighted estimate, use the most-used model's multiplier
  // or 1x if we can't determine it
  const primaryMultiplier =
    byModel.length > 0 ? byModel[0].multiplier : DEFAULT_MULTIPLIER;
  const compactionWeighted = compactionTotal * primaryMultiplier;

  return {
    userPrompts,
    totalWeighted,
    byModel,
    compaction: {
      total: compactionTotal,
      auto: compactionAuto,
      manual: compactionTotal - compactionAuto,
    },
    compactionWeighted,
    grandTotalWeighted: totalWeighted + compactionWeighted,
  };
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatMultiplier(m: number): string {
  if (m === 0) return "0x (included)";
  if (Number.isInteger(m)) return `${m}x`;
  return `${m}x`;
}

function formatWeighted(w: number): string {
  if (Number.isInteger(w)) return String(w);
  return w.toFixed(1);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TokenSummary({ messages, session }: TokenSummaryProps) {
  const isSubagent = Boolean(session?.parentID);
  const totals = useMemo(() => aggregateTokens(messages), [messages]);
  const tokensByModel = useMemo(() => aggregateTokensByModel(messages), [messages]);
  const premium = useMemo(
    () => aggregatePremiumRequests(messages, isSubagent),
    [messages, isSubagent],
  );
  const [breakdownOpen, { toggle: toggleBreakdown }] = useDisclosure(false);
  const [tokenModelOpen, { toggle: toggleTokenModel }] = useDisclosure(true);

  const hasData =
    totals.input > 0 || totals.output > 0 || premium.userPrompts > 0 || isSubagent;

  if (!hasData) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        No token data yet
      </Text>
    );
  }

  return (
    <Stack gap="sm">
      {/* ---- Subagent notice ---- */}
      {isSubagent && (
        <Paper p="sm" withBorder radius="sm" bg="var(--mantine-color-violet-light)">
          <Group gap="xs" wrap="nowrap">
            <ThemeIcon size="sm" variant="light" color="violet" radius="xl">
              <Lightning size={14} weight="fill" />
            </ThemeIcon>
            <Text size="sm" fw={500} c="violet">
              Subagent — prompts not counted as premium requests
            </Text>
          </Group>
          <Text size="xs" c="dimmed" mt={4}>
            This session was spawned autonomously by a parent session. Per
            GitHub Copilot billing, only user-initiated prompts count as
            premium requests.
          </Text>
        </Paper>
      )}

      {/* ---- Premium Requests ---- */}
      {premium.userPrompts > 0 && (
        <>
          <UnstyledButton onClick={toggleBreakdown} w="100%">
            <Paper p="sm" withBorder radius="sm">
              <Group justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap">
                  <ThemeIcon
                    size="sm"
                    variant="light"
                    color="yellow"
                    radius="xl"
                  >
                    <Lightning size={14} weight="fill" />
                  </ThemeIcon>
                  <Text size="sm" fw={500}>
                    Premium Requests
                  </Text>
                  {breakdownOpen ? (
                    <CaretDown size={14} />
                  ) : (
                    <CaretRight size={14} />
                  )}
                </Group>

                <Group gap="xs" wrap="nowrap">
                  <Badge size="lg" color="yellow" variant="light">
                    {premium.userPrompts} prompt
                    {premium.userPrompts !== 1 ? "s" : ""}
                  </Badge>
                  {premium.totalWeighted !== premium.userPrompts && (
                    <Badge size="lg" color="orange" variant="light">
                      {formatWeighted(premium.grandTotalWeighted)} weighted
                    </Badge>
                  )}
                </Group>
              </Group>
            </Paper>
          </UnstyledButton>

          <Collapse expanded={breakdownOpen}>
            <Stack gap="xs" pl="xs" pr="xs">
              {/* Per-model table */}
              <Paper p="xs" withBorder radius="sm">
                <Text size="xs" fw={600} mb="xs">
                  By Model
                </Text>
                <Table
                  striped
                  highlightOnHover
                  withTableBorder={false}
                  fz="xs"
                >
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Model</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>
                        Prompts
                      </Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>
                        Rate
                      </Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>
                        Weighted
                      </Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {premium.byModel.map((m) => (
                      <Table.Tr key={`${m.providerID}/${m.modelID}`}>
                        <Table.Td>
                          <Group gap={4} wrap="nowrap">
                            <Text size="xs" truncate>
                              {m.displayName}
                            </Text>
                            <Badge
                              size="xs"
                              variant="outline"
                              color="gray"
                            >
                              {m.providerID}
                            </Badge>
                          </Group>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          {m.count}
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          <Text
                            size="xs"
                            c={
                              m.multiplier === 0
                                ? "green"
                                : m.multiplier >= 3
                                  ? "red"
                                  : undefined
                            }
                          >
                            {formatMultiplier(m.multiplier)}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }} fw={600}>
                          {formatWeighted(m.weighted)}
                        </Table.Td>
                      </Table.Tr>
                    ))}

                    {/* Subtotal row */}
                    <Table.Tr>
                      <Table.Td>
                        <Text size="xs" fw={600}>
                          User prompts subtotal
                        </Text>
                      </Table.Td>
                      <Table.Td style={{ textAlign: "right" }} fw={600}>
                        {premium.userPrompts}
                      </Table.Td>
                      <Table.Td />
                      <Table.Td style={{ textAlign: "right" }} fw={600}>
                        {formatWeighted(premium.totalWeighted)}
                      </Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>
              </Paper>

              {/* Compaction section */}
              <Paper p="xs" withBorder radius="sm">
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="xs" wrap="nowrap">
                    <ArrowsClockwise size={14} />
                    <Text size="xs" fw={600}>
                      Compactions
                    </Text>
                  </Group>
                  <Group gap="xs" wrap="nowrap">
                    <Badge size="sm" color="gray" variant="light">
                      {premium.compaction.total} total
                    </Badge>
                    {premium.compaction.auto > 0 && (
                      <Badge size="sm" color="blue" variant="light">
                        {premium.compaction.auto} auto
                      </Badge>
                    )}
                    {premium.compaction.manual > 0 && (
                      <Badge size="sm" color="violet" variant="light">
                        {premium.compaction.manual} manual
                      </Badge>
                    )}
                  </Group>
                </Group>
                <Text size="xs" c="dimmed" mt={4}>
                  Compactions may trigger additional model calls. Weighted
                  estimate: {formatWeighted(premium.compactionWeighted)} (using
                  primary model rate).
                </Text>
              </Paper>

              {/* Grand total */}
              <Paper p="xs" withBorder radius="sm" bg="var(--mantine-color-dark-6)">
                <Group justify="space-between" wrap="nowrap">
                  <Text size="xs" fw={600}>
                    Combined Estimate
                  </Text>
                  <Badge size="lg" color="orange" variant="filled">
                    {formatWeighted(premium.grandTotalWeighted)} premium
                    request{premium.grandTotalWeighted !== 1 ? "s" : ""}
                  </Badge>
                </Group>
                <Text size="xs" c="dimmed" mt={4}>
                  = {premium.userPrompts} prompt
                  {premium.userPrompts !== 1 ? "s" : ""} (
                  {formatWeighted(premium.totalWeighted)} weighted)
                  {premium.compaction.total > 0 &&
                    ` + ${premium.compaction.total} compaction${premium.compaction.total !== 1 ? "s" : ""} (${formatWeighted(premium.compactionWeighted)} weighted)`}
                </Text>
              </Paper>
            </Stack>
          </Collapse>

          <Divider />
        </>
      )}

      {/* ---- Cost ---- */}
      <Paper p="sm" withBorder radius="sm">
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            Total Cost
          </Text>
          <Badge size="lg" color="green" variant="light">
            {formatCost(totals.cost)}
          </Badge>
        </Group>
      </Paper>

      {/* ---- Token Breakdown by Model ---- */}
      {tokensByModel.length > 0 && (
        <>
          <UnstyledButton onClick={toggleTokenModel} w="100%">
            <Paper p="sm" withBorder radius="sm">
              <Group justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap">
                  <Text size="sm" fw={500}>
                    Token Breakdown by Model
                  </Text>
                  {tokenModelOpen ? (
                    <CaretDown size={14} />
                  ) : (
                    <CaretRight size={14} />
                  )}
                </Group>
                <Badge size="sm" color="blue" variant="light">
                  {tokensByModel.length} model{tokensByModel.length !== 1 ? "s" : ""}
                </Badge>
              </Group>
            </Paper>
          </UnstyledButton>

          <Collapse expanded={tokenModelOpen}>
            <Stack gap="xs" pl="xs" pr="xs">
              <Paper p="xs" withBorder radius="sm">
                <Text size="xs" c="dimmed" mb="xs">
                  Per-token prices from{" "}
                  <Text
                    component="a"
                    href="https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing"
                    target="_blank"
                    rel="noopener noreferrer"
                    size="xs"
                    c="blue"
                  >
                    GitHub Copilot pricing
                  </Text>
                  . Est. cost may differ from actual if model pricing is unknown or has surcharges.
                </Text>
                <Table striped highlightOnHover withTableBorder={false} fz="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Model</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>Input</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>Output</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>Cache R</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>Cache W</Table.Th>
                      {tokensByModel.some((m) => m.tokens.reasoning > 0) && (
                        <Table.Th style={{ textAlign: "right" }}>Reasoning</Table.Th>
                      )}
                      <Table.Th style={{ textAlign: "right" }}>Est. Cost</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {tokensByModel.map((m) => (
                      <Table.Tr key={`${m.providerID}/${m.modelID}`}>
                        <Table.Td>
                          <Group gap={4} wrap="nowrap">
                            <Text size="xs" truncate>
                              {m.displayName}
                            </Text>
                            <Badge size="xs" variant="outline" color="gray">
                              {m.providerID}
                            </Badge>
                          </Group>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          {formatTokens(m.tokens.input)}
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          {formatTokens(m.tokens.output)}
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          {m.tokens.cacheRead > 0 ? formatTokens(m.tokens.cacheRead) : "—"}
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          {m.tokens.cacheWrite > 0 ? formatTokens(m.tokens.cacheWrite) : "—"}
                        </Table.Td>
                        {tokensByModel.some((x) => x.tokens.reasoning > 0) && (
                          <Table.Td style={{ textAlign: "right" }}>
                            {m.tokens.reasoning > 0 ? formatTokens(m.tokens.reasoning) : "—"}
                          </Table.Td>
                        )}
                        <Table.Td style={{ textAlign: "right" }} fw={600}>
                          {m.estimatedCost !== null ? (
                            <Tooltip
                              label={`Actual: ${formatCost(m.actualCost)}`}
                              withArrow
                            >
                              <Text
                                size="xs"
                                fw={600}
                                c="green"
                                style={{ cursor: "default" }}
                              >
                                ~{formatCost(m.estimatedCost)}
                              </Text>
                            </Tooltip>
                          ) : (
                            <Tooltip
                              label={`Actual: ${formatCost(m.actualCost)} — no pricing data for this model`}
                              withArrow
                              multiline
                              w={200}
                            >
                              <Text size="xs" c="dimmed" style={{ cursor: "default" }}>
                                {formatCost(m.actualCost)}
                              </Text>
                            </Tooltip>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}

                    {/* Totals row */}
                    {tokensByModel.length > 1 && (() => {
                      const totalEstimated = tokensByModel.reduce<number | null>(
                        (acc, m) =>
                          m.estimatedCost !== null
                            ? (acc ?? 0) + m.estimatedCost
                            : acc,
                        null,
                      );
                      return (
                        <Table.Tr>
                          <Table.Td>
                            <Text size="xs" fw={600}>Total</Text>
                          </Table.Td>
                          <Table.Td style={{ textAlign: "right" }} fw={600}>
                            {formatTokens(totals.input)}
                          </Table.Td>
                          <Table.Td style={{ textAlign: "right" }} fw={600}>
                            {formatTokens(totals.output)}
                          </Table.Td>
                          <Table.Td style={{ textAlign: "right" }} fw={600}>
                            {totals.cacheRead > 0 ? formatTokens(totals.cacheRead) : "—"}
                          </Table.Td>
                          <Table.Td style={{ textAlign: "right" }} fw={600}>
                            {totals.cacheWrite > 0 ? formatTokens(totals.cacheWrite) : "—"}
                          </Table.Td>
                          {tokensByModel.some((x) => x.tokens.reasoning > 0) && (
                            <Table.Td style={{ textAlign: "right" }} fw={600}>
                              {totals.reasoning > 0 ? formatTokens(totals.reasoning) : "—"}
                            </Table.Td>
                          )}
                          <Table.Td style={{ textAlign: "right" }} fw={600}>
                            {totalEstimated !== null ? (
                              <Text size="xs" fw={600} c="green">
                                ~{formatCost(totalEstimated)}
                              </Text>
                            ) : (
                              <Text size="xs" fw={600}>
                                {formatCost(totals.cost)}
                              </Text>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })()}
                  </Table.Tbody>
                </Table>
              </Paper>
            </Stack>
          </Collapse>

          <Divider />
        </>
      )}

      {/* ---- Token counts ---- */}
      <Group grow gap="xs">
        <Paper p="sm" withBorder radius="sm">
          <Stack gap={2} align="center">
            <Tooltip
              label="Tokens sent to the model in this request, excluding any cached tokens."
              withArrow
              multiline
              w={220}
            >
              <Text size="xs" c="dimmed" style={{ cursor: "default", textDecoration: "underline dotted" }}>
                Input
              </Text>
            </Tooltip>
            <Text size="sm" fw={600}>
              {formatTokens(totals.input)}
            </Text>
          </Stack>
        </Paper>
        <Paper p="sm" withBorder radius="sm">
          <Stack gap={2} align="center">
            <Tooltip
              label="Tokens generated by the model in its response."
              withArrow
              multiline
              w={220}
            >
              <Text size="xs" c="dimmed" style={{ cursor: "default", textDecoration: "underline dotted" }}>
                Output
              </Text>
            </Tooltip>
            <Text size="sm" fw={600}>
              {formatTokens(totals.output)}
            </Text>
          </Stack>
        </Paper>
        {totals.reasoning > 0 && (
          <Paper p="sm" withBorder radius="sm">
            <Stack gap={2} align="center">
              <Tooltip
                label="Internal chain-of-thought tokens used by reasoning models (e.g. o1, o3). Billed but not shown in the response."
                withArrow
                multiline
                w={220}
              >
                <Text size="xs" c="dimmed" style={{ cursor: "default", textDecoration: "underline dotted" }}>
                  Reasoning
                </Text>
              </Tooltip>
              <Text size="sm" fw={600}>
                {formatTokens(totals.reasoning)}
              </Text>
            </Stack>
          </Paper>
        )}
      </Group>

      {(totals.cacheRead > 0 || totals.cacheWrite > 0) && (
        <Group grow gap="xs">
          <Paper p="sm" withBorder radius="sm">
            <Stack gap={2} align="center">
              <Tooltip
                label="Tokens retrieved from the prompt cache. These are cheaper than fresh input tokens since the model already processed them."
                withArrow
                multiline
                w={220}
              >
                <Text size="xs" c="dimmed" style={{ cursor: "default", textDecoration: "underline dotted" }}>
                  Cache Read
                </Text>
              </Tooltip>
              <Text size="sm" fw={600}>
                {formatTokens(totals.cacheRead)}
              </Text>
            </Stack>
          </Paper>
          <Paper p="sm" withBorder radius="sm">
            <Stack gap={2} align="center">
              <Tooltip
                label="Tokens written into the prompt cache this request. Slightly more expensive than regular input, but future requests that reuse this context will be cheaper."
                withArrow
                multiline
                w={220}
              >
                <Text size="xs" c="dimmed" style={{ cursor: "default", textDecoration: "underline dotted" }}>
                  Cache Write
                </Text>
              </Tooltip>
              <Text size="sm" fw={600}>
                {formatTokens(totals.cacheWrite)}
              </Text>
            </Stack>
          </Paper>
        </Group>
      )}
    </Stack>
  );
}
