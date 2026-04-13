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
  const premium = useMemo(
    () => aggregatePremiumRequests(messages, isSubagent),
    [messages, isSubagent],
  );
  const [breakdownOpen, { toggle: toggleBreakdown }] = useDisclosure(false);

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
