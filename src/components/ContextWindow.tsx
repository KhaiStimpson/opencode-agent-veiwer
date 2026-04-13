import {
  Stack,
  Group,
  Text,
  Paper,
  Badge,
  Progress,
  RingProgress,
  Table,
  Divider,
  ThemeIcon,
} from "@mantine/core";
import { AreaChart } from "@mantine/charts";
import {
  Brain,
  ArrowsClockwise,
  Lightning,
  Warning,
} from "@phosphor-icons/react";
import { formatTokens } from "../lib/opencode";
import { getModelLimits } from "../hooks/useProviders";
import type { Message, Part } from "../types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MessageWithParts {
  info: Message;
  parts: Part[];
}

interface ContextWindowProps {
  messages: MessageWithParts[];
  modelLimits: Map<string, { context: number; output: number }>;
}

// ---------------------------------------------------------------------------
// Data extraction helpers
// ---------------------------------------------------------------------------

interface ContextDataPoint {
  index: number;
  label: string;
  inputTokens: number;
  outputTokens: number;
  utilizationPct: number;
  isCompaction: boolean;
  messageId: string;
}

interface StepTokenInfo {
  messageIndex: number;
  stepIndex: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

/**
 * Compute the total context window size for an assistant message.
 *
 * With prompt caching (used by Claude, GPT, etc.), `tokens.input` only
 * counts uncached input tokens. Cached tokens are reported separately in
 * `tokens.cache.read` (reused from a previous turn) and `tokens.cache.write`
 * (newly written to cache this turn). The real context window footprint is
 * the sum of all three.
 */
function computeContextSize(info: MessageWithParts["info"]): number {
  if (info.role !== "assistant") return 0;
  return (
    info.tokens.input +
    info.tokens.cache.read +
    info.tokens.cache.write
  );
}

/**
 * Extract context growth data from assistant messages.
 * Each data point represents the full context window size at that turn,
 * computed as input + cache.read + cache.write.
 */
function extractContextData(
  messages: MessageWithParts[],
  contextLimit: number,
): ContextDataPoint[] {
  const points: ContextDataPoint[] = [];
  let msgIndex = 0;

  for (const { info, parts } of messages) {
    if (info.role !== "assistant") {
      // Check for compaction parts in any message
      const hasCompaction = parts.some((p) => p.type === "compaction");
      if (hasCompaction) {
        points.push({
          index: msgIndex++,
          label: "Compaction",
          inputTokens: 0,
          outputTokens: 0,
          utilizationPct: 0,
          isCompaction: true,
          messageId: info.id,
        });
      }
      continue;
    }

    // info.role is "assistant" here, so tokens/providerID/modelID are available
    const contextSize = computeContextSize(info);
    const outputTokens = info.tokens.output;
    const pct = contextLimit > 0 ? (contextSize / contextLimit) * 100 : 0;

    // Check if this message has compaction parts
    const hasCompaction = parts.some((p) => p.type === "compaction");

    points.push({
      index: msgIndex++,
      label: `Turn ${points.filter((p) => !p.isCompaction).length + 1}`,
      inputTokens: contextSize,
      outputTokens,
      utilizationPct: Math.min(pct, 100),
      isCompaction: hasCompaction,
      messageId: info.id,
    });
  }

  return points;
}

/**
 * Extract step-finish parts for per-step token detail.
 */
function extractStepTokens(messages: MessageWithParts[]): StepTokenInfo[] {
  const steps: StepTokenInfo[] = [];
  let msgIdx = 0;

  for (const { info, parts } of messages) {
    if (info.role !== "assistant") continue;

    let stepIdx = 0;
    for (const part of parts) {
      if (part.type === "step-finish") {
        steps.push({
          messageIndex: msgIdx,
          stepIndex: stepIdx++,
          inputTokens: part.tokens.input,
          outputTokens: part.tokens.output,
          cost: part.cost,
        });
      }
    }
    msgIdx++;
  }

  return steps;
}

/**
 * Count compaction events and extract detail.
 */
function extractCompactions(messages: MessageWithParts[]): {
  total: number;
  auto: number;
  manual: number;
} {
  let total = 0;
  let auto = 0;

  for (const { parts } of messages) {
    for (const part of parts) {
      if (part.type === "compaction") {
        total++;
        if (part.auto) auto++;
      }
    }
  }

  return { total, auto, manual: total - auto };
}

// ---------------------------------------------------------------------------
// Chart data helpers
// ---------------------------------------------------------------------------

interface ChartDataPoint {
  turn: string;
  "Context Used": number | null;
  "Context Limit": number;
  isCompaction?: boolean;
}

interface ChartBuildResult {
  data: ChartDataPoint[];
  /** Turn labels where compactions occurred, used for vertical reference lines */
  compactionTurns: string[];
}

/**
 * Build chart data including compaction drop points.
 *
 * For each compaction, we insert a synthetic data point with "Context Used"
 * set to null (breaks the line) preceded by the last known context value and
 * followed by the post-compaction value. This creates a sharp visible drop.
 * We also record the label for a vertical reference line.
 */
function buildChartData(
  contextData: ContextDataPoint[],
  contextLimit: number,
): ChartBuildResult {
  const data: ChartDataPoint[] = [];
  const compactionTurns: string[] = [];

  let lastContextValue = 0;

  for (const d of contextData) {
    if (d.isCompaction && d.inputTokens === 0) {
      // Pure compaction marker (no tokens — came from a non-assistant message).
      // Insert a zero-value point to show the drop.
      const label = `Compact ${compactionTurns.length + 1}`;
      compactionTurns.push(label);
      // Drop the line to 0 at this point
      data.push({
        turn: label,
        "Context Used": 0,
        "Context Limit": contextLimit,
        isCompaction: true,
      });
    } else {
      // Normal assistant turn (may also have a compaction flag if the
      // compaction part is attached to the assistant message itself).
      if (d.isCompaction) {
        // The context already dropped — mark the previous value then show drop
        const label = `Compact ${compactionTurns.length + 1}`;
        compactionTurns.push(label);
        data.push({
          turn: label,
          "Context Used": lastContextValue,
          "Context Limit": contextLimit,
          isCompaction: true,
        });
      }
      lastContextValue = d.inputTokens;
      data.push({
        turn: d.label,
        "Context Used": d.inputTokens,
        "Context Limit": contextLimit,
      });
    }
  }

  return { data, compactionTurns };
}

// ---------------------------------------------------------------------------
// Utilization color
// ---------------------------------------------------------------------------

function getUtilizationColor(pct: number): string {
  if (pct >= 90) return "red";
  if (pct >= 75) return "orange";
  if (pct >= 50) return "yellow";
  return "blue";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContextWindow({
  messages,
  modelLimits,
}: ContextWindowProps) {
  // Determine the model used in this session from the most recent assistant message
  const lastAssistantMsg = [...messages]
    .reverse()
    .find((m) => m.info.role === "assistant");
  const lastAssistantInfo =
    lastAssistantMsg?.info.role === "assistant" ? lastAssistantMsg.info : null;

  const providerID = lastAssistantInfo?.providerID ?? "";
  const modelID = lastAssistantInfo?.modelID ?? "";
  const limits = getModelLimits(modelLimits, providerID, modelID);

  const contextLimit = limits?.context ?? 0;
  const outputLimit = limits?.output ?? 0;

  // Current context usage from the latest assistant message
  // Context size = input + cache.read + cache.write (not just tokens.input,
  // which only counts uncached tokens)
  const currentContextSize = lastAssistantInfo
    ? computeContextSize(lastAssistantMsg!.info)
    : 0;
  const currentOutput = lastAssistantInfo?.tokens.output ?? 0;
  const utilizationPct =
    contextLimit > 0 ? Math.min((currentContextSize / contextLimit) * 100, 100) : 0;

  // Extract data for the chart
  const contextData = extractContextData(messages, contextLimit);
  const { data: chartData, compactionTurns } = buildChartData(contextData, contextLimit);
  const stepTokens = extractStepTokens(messages);
  const compactions = extractCompactions(messages);

  // Count assistant messages (turns)
  const assistantCount = messages.filter(
    (m) => m.info.role === "assistant",
  ).length;

  // Peak context usage
  const peakInput = contextData.reduce(
    (max, d) => Math.max(max, d.inputTokens),
    0,
  );
  const peakPct =
    contextLimit > 0 ? Math.min((peakInput / contextLimit) * 100, 100) : 0;

  // No data yet
  if (assistantCount === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="xl">
        No context data yet — waiting for assistant responses
      </Text>
    );
  }

  // No model limits available
  const hasLimits = contextLimit > 0;

  return (
    <Stack gap="md">
      {/* ---- Model Info ---- */}
      <Paper p="sm" withBorder radius="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <ThemeIcon size="sm" variant="light" color="blue" radius="xl">
              <Brain size={14} weight="fill" />
            </ThemeIcon>
            <Text size="sm" fw={600}>
              Model
            </Text>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Badge size="sm" variant="light" color="gray">
              {providerID}/{modelID}
            </Badge>
            {hasLimits && (
              <>
                <Badge size="sm" variant="light" color="blue">
                  {formatTokens(contextLimit)} context
                </Badge>
                {outputLimit > 0 && (
                  <Badge size="sm" variant="light" color="teal">
                    {formatTokens(outputLimit)} max output
                  </Badge>
                )}
              </>
            )}
          </Group>
        </Group>
      </Paper>

      {/* ---- No limits warning ---- */}
      {!hasLimits && (
        <Paper
          p="sm"
          withBorder
          radius="sm"
          bg="var(--mantine-color-yellow-light)"
        >
          <Group gap="xs" wrap="nowrap">
            <Warning size={16} weight="fill" color="var(--mantine-color-yellow-6)" />
            <Text size="sm" c="dimmed">
              Context window limit not available for this model. Token counts
              are shown but utilization percentage cannot be calculated.
            </Text>
          </Group>
        </Paper>
      )}

      {/* ---- Current Utilization Gauge ---- */}
      <Paper p="md" withBorder radius="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          {/* Ring Progress */}
          <Stack gap="xs" align="center">
            <RingProgress
              size={120}
              thickness={12}
              roundCaps
              label={
                <Text ta="center" size="lg" fw={700}>
                  {hasLimits ? `${utilizationPct.toFixed(1)}%` : "—"}
                </Text>
              }
              sections={[
                {
                  value: hasLimits ? utilizationPct : 0,
                  color: getUtilizationColor(utilizationPct),
                },
              ]}
            />
            <Text size="xs" c="dimmed">
              Current Utilization
            </Text>
          </Stack>

          {/* Stats */}
          <Stack gap="xs" style={{ flex: 1 }} ml="md">
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Context Used
              </Text>
              <Text size="sm" fw={600}>
                {formatTokens(currentContextSize)}
                {hasLimits && (
                  <Text span size="xs" c="dimmed">
                    {" "}
                    / {formatTokens(contextLimit)}
                  </Text>
                )}
              </Text>
            </Group>

            {hasLimits && (
              <Progress
                value={utilizationPct}
                color={getUtilizationColor(utilizationPct)}
                size="lg"
                radius="xl"
              />
            )}

            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Last Output
              </Text>
              <Text size="sm" fw={600}>
                {formatTokens(currentOutput)}
                {outputLimit > 0 && (
                  <Text span size="xs" c="dimmed">
                    {" "}
                    / {formatTokens(outputLimit)}
                  </Text>
                )}
              </Text>
            </Group>

            <Divider my={4} />

            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Peak Context
              </Text>
              <Text size="sm" fw={600}>
                {formatTokens(peakInput)}
                {hasLimits && (
                  <Text span size="xs" c="dimmed">
                    {" "}
                    ({peakPct.toFixed(1)}%)
                  </Text>
                )}
              </Text>
            </Group>

            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Turns
              </Text>
              <Text size="sm" fw={600}>
                {assistantCount}
              </Text>
            </Group>
          </Stack>
        </Group>
      </Paper>

      {/* ---- Context Growth Chart ---- */}
      {chartData.length > 1 && (
        <Paper p="md" withBorder radius="sm">
          <Text size="sm" fw={600} mb="sm">
            Context Growth Over Time
          </Text>
          <AreaChart
            h={250}
            data={chartData}
            dataKey="turn"
            withDots
            connectNulls={false}
            curveType="linear"
            series={[
              {
                name: "Context Used",
                color: "blue.6",
              },
              ...(hasLimits
                ? [
                    {
                      name: "Context Limit" as const,
                      color: "red.3",
                    },
                  ]
                : []),
            ]}
            referenceLines={compactionTurns.map((turn) => ({
              x: turn,
              color: "orange.6",
              label: "Compaction",
              labelPosition: "insideTopRight" as const,
            }))}
            valueFormatter={(value) => formatTokens(value)}
          />
          {compactionTurns.length > 0 && (
            <Text size="xs" c="dimmed" mt="xs">
              Orange lines mark compaction events — earlier messages were
              summarized to free context space, causing the drop.
            </Text>
          )}
        </Paper>
      )}

      {/* ---- Compaction Summary ---- */}
      {compactions.total > 0 && (
        <Paper p="sm" withBorder radius="sm">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              <ThemeIcon
                size="sm"
                variant="light"
                color="orange"
                radius="xl"
              >
                <ArrowsClockwise size={14} weight="fill" />
              </ThemeIcon>
              <Text size="sm" fw={600}>
                Compactions
              </Text>
            </Group>
            <Group gap="xs" wrap="nowrap">
              <Badge size="sm" color="gray" variant="light">
                {compactions.total} total
              </Badge>
              {compactions.auto > 0 && (
                <Badge size="sm" color="blue" variant="light">
                  {compactions.auto} auto
                </Badge>
              )}
              {compactions.manual > 0 && (
                <Badge size="sm" color="violet" variant="light">
                  {compactions.manual} manual
                </Badge>
              )}
            </Group>
          </Group>
          <Text size="xs" c="dimmed" mt={4}>
            Compactions summarize earlier messages to free context space. After
            compaction, old messages are removed from the API response.
          </Text>
        </Paper>
      )}

      {/* ---- Step-Level Token Breakdown ---- */}
      {stepTokens.length > 0 && (
        <Paper p="sm" withBorder radius="sm">
          <Group gap="xs" mb="xs" wrap="nowrap">
            <ThemeIcon size="sm" variant="light" color="teal" radius="xl">
              <Lightning size={14} weight="fill" />
            </ThemeIcon>
            <Text size="sm" fw={600}>
              Per-Step Token Breakdown
            </Text>
            <Badge size="xs" variant="light" color="gray">
              {stepTokens.length} steps
            </Badge>
          </Group>
          <Table striped highlightOnHover fz="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Step</Table.Th>
                <Table.Th style={{ textAlign: "right" }}>Input</Table.Th>
                <Table.Th style={{ textAlign: "right" }}>Output</Table.Th>
                <Table.Th style={{ textAlign: "right" }}>
                  {hasLimits ? "Utilization" : "Total"}
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {stepTokens.map((step, i) => {
                const stepPct =
                  contextLimit > 0
                    ? (step.inputTokens / contextLimit) * 100
                    : 0;
                return (
                  <Table.Tr key={i}>
                    <Table.Td>
                      <Text size="xs">
                        Turn {step.messageIndex + 1}, Step{" "}
                        {step.stepIndex + 1}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: "right" }}>
                      {formatTokens(step.inputTokens)}
                    </Table.Td>
                    <Table.Td style={{ textAlign: "right" }}>
                      {formatTokens(step.outputTokens)}
                    </Table.Td>
                    <Table.Td style={{ textAlign: "right" }}>
                      {hasLimits ? (
                        <Badge
                          size="xs"
                          variant="light"
                          color={getUtilizationColor(stepPct)}
                        >
                          {stepPct.toFixed(1)}%
                        </Badge>
                      ) : (
                        formatTokens(step.inputTokens + step.outputTokens)
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
