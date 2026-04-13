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
  Collapse,
  UnstyledButton,
  ScrollArea,
  Code,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { AreaChart } from "@mantine/charts";
import {
  Brain,
  ArrowsClockwise,
  Lightning,
  Warning,
  User,
  Robot,
  CaretDown,
  CaretRight,
  Wrench,
  Scissors,
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
// Context Contents helpers
// ---------------------------------------------------------------------------

/** Truncate a string to maxLen chars, appending ellipsis if needed. */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "…";
}

interface ContextMessageRowProps {
  msg: MessageWithParts;
  index: number;
  contextLimit: number;
}

/** A single collapsed/expandable message row inside the context viewer. */
function ContextMessageRow({
  msg,
  index,
  contextLimit,
}: ContextMessageRowProps) {
  const [open, { toggle }] = useDisclosure(false);
  const isUser = msg.info.role === "user";
  const isAssistant = msg.info.role === "assistant";

  // Gather text parts, compaction parts, tool parts
  const textParts = msg.parts.filter((p) => p.type === "text");
  const toolParts = msg.parts.filter((p) => p.type === "tool");
  const compactionParts = msg.parts.filter((p) => p.type === "compaction");
  const stepFinishParts = msg.parts.filter((p) => p.type === "step-finish");

  // Build a short summary line
  const firstText = textParts[0];
  const previewText =
    firstText?.type === "text" && firstText.text
      ? truncate(firstText.text.trim().replace(/\n+/g, " "), 120)
      : "";

  // Token info for assistant messages
  const contextSize =
    isAssistant && msg.info.role === "assistant"
      ? msg.info.tokens.input +
        msg.info.tokens.cache.read +
        msg.info.tokens.cache.write
      : 0;
  const utilizationPct =
    contextLimit > 0 && contextSize > 0
      ? Math.min((contextSize / contextLimit) * 100, 100)
      : 0;

  const borderColor = isUser
    ? "var(--mantine-color-blue-6)"
    : compactionParts.length > 0
      ? "var(--mantine-color-orange-6)"
      : "var(--mantine-color-green-6)";

  return (
    <Paper
      withBorder
      radius="sm"
      style={{ borderLeft: `3px solid ${borderColor}` }}
    >
      {/* Header row — always visible */}
      <UnstyledButton onClick={toggle} w="100%">
        <Group px="sm" py="xs" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            {open ? <CaretDown size={13} /> : <CaretRight size={13} />}
            {isUser ? (
              <User size={14} weight="bold" />
            ) : (
              <Robot size={14} weight="bold" />
            )}
            <Badge size="xs" variant="light" color={isUser ? "blue" : "green"}>
              {isUser ? "User" : "Assistant"}
            </Badge>
            {isAssistant && msg.info.role === "assistant" && (
              <Badge size="xs" variant="outline" color="gray">
                {msg.info.providerID}/{msg.info.modelID}
              </Badge>
            )}
            {compactionParts.length > 0 && (
              <Badge size="xs" variant="light" color="orange">
                compacted
              </Badge>
            )}
            {toolParts.length > 0 && (
              <Badge size="xs" variant="light" color="gray">
                <Group gap={3} wrap="nowrap">
                  <Wrench size={10} />
                  {toolParts.length}
                </Group>
              </Badge>
            )}
            <Text
              size="xs"
              c="dimmed"
              truncate
              style={{ flex: 1, minWidth: 0 }}
            >
              {previewText}
            </Text>
          </Group>
          <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
            {isAssistant && contextSize > 0 && (
              <Text size="xs" c="dimmed">
                {formatTokens(contextSize)}
                {utilizationPct > 0 && (
                  <Text
                    span
                    size="xs"
                    c={getUtilizationColor(utilizationPct)}
                  >
                    {" "}
                    ({utilizationPct.toFixed(1)}%)
                  </Text>
                )}
              </Text>
            )}
            <Text size="xs" c="dimmed">
              #{index + 1}
            </Text>
          </Group>
        </Group>
      </UnstyledButton>

      {/* Expanded body */}
      <Collapse expanded={open}>
        <Divider />
        <Stack gap="xs" px="sm" py="xs">
          {/* Text parts */}
          {textParts.map((p) =>
            p.type === "text" ? (
              <Text
                key={p.id}
                size="xs"
                c={p.ignored ? "dimmed" : undefined}
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  opacity: p.ignored ? 0.5 : 1,
                  fontStyle: p.synthetic ? "italic" : undefined,
                }}
              >
                {p.ignored && (
                  <Badge
                    size="xs"
                    color="gray"
                    variant="outline"
                    mr={4}
                  >
                    ignored
                  </Badge>
                )}
                {p.synthetic && (
                  <Badge
                    size="xs"
                    color="gray"
                    variant="outline"
                    mr={4}
                  >
                    synthetic
                  </Badge>
                )}
                {p.text}
              </Text>
            ) : null
          )}

          {/* Compaction marker */}
          {compactionParts.map((p) =>
            p.type === "compaction" ? (
              <Group key={p.id} gap="xs" wrap="nowrap">
                <Scissors size={13} color="var(--mantine-color-orange-6)" />
                <Text size="xs" c="orange">
                  Context compacted ({p.auto ? "automatic" : "manual"}) —
                  earlier messages were summarized and removed.
                </Text>
              </Group>
            ) : null
          )}

          {/* Tool calls summary */}
          {toolParts.length > 0 && (
            <Stack gap={4}>
              {toolParts.map((p) => {
                if (p.type !== "tool") return null;
                const state = p.state;
                const isCompleted = state.status === "completed";
                const isError = state.status === "error";
                return (
                  <Paper key={p.id} p="xs" withBorder radius="sm">
                    <Group gap="xs" justify="space-between" wrap="nowrap">
                      <Group gap="xs" wrap="nowrap">
                        <Wrench
                          size={12}
                          color={
                            isError
                              ? "var(--mantine-color-red-6)"
                              : isCompleted
                                ? "var(--mantine-color-teal-6)"
                                : "var(--mantine-color-gray-6)"
                          }
                        />
                        <Text size="xs" fw={500}>
                          {p.tool}
                        </Text>
                        <Badge
                          size="xs"
                          variant="light"
                          color={
                            isError ? "red" : isCompleted ? "teal" : "gray"
                          }
                        >
                          {state.status}
                        </Badge>
                        {isCompleted && state.time?.compacted && (
                          <Badge size="xs" variant="outline" color="orange">
                            output compacted
                          </Badge>
                        )}
                      </Group>
                    </Group>
                    {/* Tool input snippet */}
                    {state.status !== "pending" && "input" in state && state.input && (
                      <Code
                        block
                        mt={4}
                        style={{ fontSize: 11, maxHeight: 80, overflow: "auto" }}
                      >
                        {truncate(JSON.stringify(state.input, null, 2), 300)}
                      </Code>
                    )}
                    {/* Tool output snippet */}
                    {isCompleted && "output" in state && state.output && (
                      <Code
                        block
                        mt={4}
                        color="teal"
                        style={{ fontSize: 11, maxHeight: 100, overflow: "auto" }}
                      >
                        {truncate(
                          typeof state.output === "string"
                            ? state.output
                            : JSON.stringify(state.output, null, 2),
                          400,
                        )}
                      </Code>
                    )}
                  </Paper>
                );
              })}
            </Stack>
          )}

          {/* Step-finish token detail */}
          {stepFinishParts.length > 0 && (
            <Group gap={4} wrap="wrap">
              <Lightning
                size={12}
                color="var(--mantine-color-teal-6)"
              />
              {stepFinishParts.map((p) =>
                p.type === "step-finish" ? (
                  <Badge key={p.id} size="xs" variant="light" color="teal">
                    step: {formatTokens(p.tokens.input)} in /{" "}
                    {formatTokens(p.tokens.output)} out
                  </Badge>
                ) : null
              )}
            </Group>
          )}
        </Stack>
      </Collapse>
    </Paper>
  );
}



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
  const [stepTokensOpen, { toggle: toggleStepTokens }] = useDisclosure(false);

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
          <UnstyledButton
            onClick={toggleStepTokens}
            style={{ width: "100%", display: "block" }}
          >
            <Group gap="xs" wrap="nowrap">
              <ThemeIcon size="sm" variant="light" color="teal" radius="xl">
                <Lightning size={14} weight="fill" />
              </ThemeIcon>
              <Text size="sm" fw={600} style={{ flex: 1 }}>
                Per-Step Token Breakdown
              </Text>
              <Badge size="xs" variant="light" color="gray">
                {stepTokens.length} steps
              </Badge>
              {stepTokensOpen ? (
                <CaretDown size={14} />
              ) : (
                <CaretRight size={14} />
              )}
            </Group>
          </UnstyledButton>
          <Collapse expanded={stepTokensOpen}>
            <Table striped highlightOnHover fz="xs" mt="xs">
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
          </Collapse>
        </Paper>
      )}

      {/* ---- Context Contents Expander ---- */}
      <ContextContentsExpander
        messages={messages}
        contextLimit={contextLimit}
      />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Context Contents expander (placed after ContextWindow to avoid hoisting
// issues with ContextMessageRow which is defined above)
// ---------------------------------------------------------------------------

interface ContextContentsExpanderProps {
  messages: MessageWithParts[];
  contextLimit: number;
}

function ContextContentsExpander({
  messages,
  contextLimit,
}: ContextContentsExpanderProps) {
  const [open, { toggle }] = useDisclosure(false);

  // Only show messages that have some visible content
  const visibleMessages = messages.filter(
    (m) =>
      m.parts.some(
        (p) => p.type === "text" || p.type === "tool" || p.type === "compaction",
      ) || m.info.role === "user",
  );

  if (visibleMessages.length === 0) return null;

  return (
    <Paper withBorder radius="sm">
      <UnstyledButton onClick={toggle} w="100%">
        <Group px="md" py="sm" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            {open ? <CaretDown size={14} /> : <CaretRight size={14} />}
            <ThemeIcon size="sm" variant="light" color="indigo" radius="xl">
              <Brain size={14} weight="fill" />
            </ThemeIcon>
            <Text size="sm" fw={600}>
              Context Contents
            </Text>
            <Badge size="xs" variant="light" color="indigo">
              {visibleMessages.length} messages in context
            </Badge>
          </Group>
          <Text size="xs" c="dimmed">
            {open ? "collapse" : "expand"}
          </Text>
        </Group>
      </UnstyledButton>

      <Collapse expanded={open}>
        <Divider />
        <ScrollArea.Autosize mah={600} px="sm" py="sm">
          <Stack gap="xs">
            {visibleMessages.map((msg, i) => (
              <ContextMessageRow
                key={msg.info.id}
                msg={msg}
                index={i}
                contextLimit={contextLimit}
              />
            ))}
          </Stack>
        </ScrollArea.Autosize>
      </Collapse>
    </Paper>
  );
}
