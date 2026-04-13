import "@mantine/charts/styles.css";

import {
  Stack,
  Group,
  Text,
  Paper,
  Badge,
  ScrollArea,
  Table,
  Progress,
  SimpleGrid,
  Divider,
  Button,
  Center,
  Loader,
} from "@mantine/core";
import { BarChart, DonutChart, AreaChart } from "@mantine/charts";
import {
  Lightning,
  CurrencyDollar,
  ChartBar,
  Users,
  TreeStructure,
  Wrench,
  Clock,
  Warning,
  ArrowsClockwise,
  CodeBlock,
  ArrowClockwise,
  Pulse,
} from "@phosphor-icons/react";
import { formatTokens, formatCost } from "../lib/opencode";
import { StatCard } from "./StatCard";
import type { DashboardStats } from "../hooks/useDashboard";

interface DashboardProps {
  stats: DashboardStats | null;
  loading: boolean;
  progress: { done: number; total: number };
  onRefresh: () => void;
}

// ---------------------------------------------------------------------------
// Provider color mapping
// ---------------------------------------------------------------------------

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "violet",
  copilot: "blue",
  openai: "green",
  google: "cyan",
  xai: "orange",
};

function providerColor(providerID: string): string {
  const lower = providerID.toLowerCase();
  for (const [key, color] of Object.entries(PROVIDER_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return "gray";
}

// Mantine charts need actual CSS color values for series
const CHART_COLORS = [
  "var(--mantine-color-violet-6)",
  "var(--mantine-color-blue-6)",
  "var(--mantine-color-green-6)",
  "var(--mantine-color-cyan-6)",
  "var(--mantine-color-orange-6)",
  "var(--mantine-color-pink-6)",
  "var(--mantine-color-yellow-6)",
  "var(--mantine-color-teal-6)",
];

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Dashboard({ stats, loading, progress, onRefresh }: DashboardProps) {
  if (loading && !stats) {
    return (
      <Center h="100%" p="xl">
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text size="sm" c="dimmed">
            Loading dashboard data...
          </Text>
          {progress.total > 0 && (
            <Stack gap="xs" w={300}>
              <Progress
                value={(progress.done / progress.total) * 100}
                size="sm"
                animated
              />
              <Text size="xs" c="dimmed" ta="center">
                Fetching session {progress.done} of {progress.total}
              </Text>
            </Stack>
          )}
        </Stack>
      </Center>
    );
  }

  if (!stats) {
    return (
      <Center h="100%" p="xl">
        <Text size="lg" c="dimmed">
          No data available
        </Text>
      </Center>
    );
  }

  // Prepare chart data
  const modelDonutData = stats.modelStats
    .filter((m) => m.cost > 0)
    .slice(0, 8)
    .map((m, i) => ({
      name: m.displayName,
      value: m.cost,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));

  const tokenBreakdownData = [
    { type: "Input", tokens: stats.totalTokens.input },
    { type: "Output", tokens: stats.totalTokens.output },
    { type: "Reasoning", tokens: stats.totalTokens.reasoning },
    { type: "Cache Read", tokens: stats.totalTokens.cacheRead },
    { type: "Cache Write", tokens: stats.totalTokens.cacheWrite },
  ].filter((d) => d.tokens > 0);

  const dailyData = stats.dailyActivity.map((d) => ({
    date: formatDate(d.date),
    "Premium Requests": d.premiumRequests,
    Cost: parseFloat(d.cost.toFixed(2)),
    "Main Sessions": d.mainSessions,
    "Subagents": d.subagentSessions,
  }));

  const toolBarData = stats.toolStats.slice(0, 15).map((t) => ({
    tool: t.tool.length > 20 ? t.tool.slice(0, 18) + ".." : t.tool,
    fullName: t.tool,
    Calls: t.calls,
    Errors: t.errors,
  }));

  const totalTokenCount = stats.totalTokens.input + stats.totalTokens.output +
    stats.totalTokens.reasoning;

  return (
    <ScrollArea h="100%" offsetScrollbars>
      <Stack gap="lg" p="lg" pb="xl">
        {/* Header */}
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs">
            <Pulse size={24} weight="bold" />
            <Text size="xl" fw={700}>
              Dashboard
            </Text>
            {loading && <Loader size="xs" />}
          </Group>
          <Button
            size="xs"
            variant="light"
            leftSection={<ArrowClockwise size={14} />}
            onClick={onRefresh}
            loading={loading}
          >
            Refresh
          </Button>
        </Group>

        {/* ================================================================ */}
        {/* Section 1: Overview Stat Cards                                    */}
        {/* ================================================================ */}
        <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="sm">
          <StatCard
            label="Main Sessions"
            value={stats.rootSessions}
            subtitle={`of ${stats.totalSessions} total`}
            icon={<Users size={20} />}
            color="blue"
          />
          <StatCard
            label="Subagents"
            value={stats.subagentSessions}
            subtitle={stats.rootSessions > 0 ? `${(stats.subagentSessions / stats.rootSessions).toFixed(1)} per session` : undefined}
            icon={<TreeStructure size={20} />}
            color="violet"
          />
          <StatCard
            label="Premium Requests"
            value={stats.totalPremiumRequests}
            subtitle={`${stats.avgTokensPerRequest > 0 ? formatTokens(Math.round(stats.avgTokensPerRequest)) : "—"} avg tokens/req`}
            icon={<Lightning size={20} weight="fill" />}
            color="yellow"
          />
          <StatCard
            label="Total Cost"
            value={formatCost(stats.totalCost)}
            subtitle={stats.totalPremiumRequests > 0 ? `${formatCost(stats.totalCost / stats.totalPremiumRequests)} per request` : undefined}
            icon={<CurrencyDollar size={20} />}
            color="green"
          />
          <StatCard
            label="Total Tokens"
            value={formatTokens(totalTokenCount)}
            subtitle={`${formatTokens(stats.totalTokens.input)} in / ${formatTokens(stats.totalTokens.output)} out`}
            icon={<ChartBar size={20} />}
            color="violet"
          />
          <StatCard
            label="Active Now"
            value={stats.activeSessions}
            subtitle={`of ${stats.totalSessions} total`}
            icon={<Pulse size={20} />}
            color={stats.activeSessions > 0 ? "blue" : "gray"}
          />
        </SimpleGrid>

        {/* ================================================================ */}
        {/* Section 2: Model Usage                                           */}
        {/* ================================================================ */}
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {/* Donut chart */}
          <Paper p="md" withBorder radius="md">
            <Text size="sm" fw={600} mb="md">
              Cost by Model
            </Text>
            {modelDonutData.length > 0 ? (
              <DonutChart
                data={modelDonutData}
                size={200}
                thickness={28}
                tooltipDataSource="segment"
                withLabelsLine
                withLabels
                chartLabel={formatCost(stats.totalCost)}
              />
            ) : (
              <Text size="sm" c="dimmed" ta="center" py="xl">
                No cost data
              </Text>
            )}
          </Paper>

          {/* Model table */}
          <Paper p="md" withBorder radius="md">
            <Text size="sm" fw={600} mb="md">
              Model Breakdown
            </Text>
            <ScrollArea.Autosize mah={320}>
              <Table striped highlightOnHover fz="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Model</Table.Th>
                    <Table.Th style={{ textAlign: "right" }}>Requests</Table.Th>
                    <Table.Th style={{ textAlign: "right" }}>Responses</Table.Th>
                    <Table.Th style={{ textAlign: "right" }}>Cost</Table.Th>
                    <Table.Th style={{ textAlign: "right" }}>Avg Response</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {stats.modelStats.map((m) => (
                    <Table.Tr key={`${m.providerID}/${m.modelID}`}>
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          <Text size="xs" truncate>
                            {m.displayName}
                          </Text>
                          <Badge
                            size="xs"
                            variant="outline"
                            color={providerColor(m.providerID)}
                          >
                            {m.providerID}
                          </Badge>
                        </Group>
                      </Table.Td>
                      <Table.Td style={{ textAlign: "right" }}>
                        {m.premiumRequests > 0 ? m.premiumRequests : "—"}
                      </Table.Td>
                      <Table.Td style={{ textAlign: "right" }}>
                        {m.messageCount}
                      </Table.Td>
                      <Table.Td style={{ textAlign: "right" }}>
                        {formatCost(m.cost)}
                      </Table.Td>
                      <Table.Td style={{ textAlign: "right" }}>
                        {m.avgResponseMs > 0 ? formatDuration(m.avgResponseMs) : "—"}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          </Paper>
        </SimpleGrid>

        {/* ================================================================ */}
        {/* Section 3: Token Breakdown                                       */}
        {/* ================================================================ */}
        <Paper p="md" withBorder radius="md">
          <Text size="sm" fw={600} mb="md">
            Token Breakdown
          </Text>
          {tokenBreakdownData.length > 0 ? (
            <BarChart
              h={220}
              data={tokenBreakdownData}
              dataKey="type"
              series={[{ name: "tokens", color: "violet.6" }]}
              tickLine="y"
              gridAxis="y"
            />
          ) : (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              No token data
            </Text>
          )}
        </Paper>

        {/* ================================================================ */}
        {/* Section 4: Activity Over Time                                    */}
        {/* ================================================================ */}
        {dailyData.length > 1 && (
          <Paper p="md" withBorder radius="md">
            <Text size="sm" fw={600} mb="md">
              Activity Over Time
            </Text>
            <AreaChart
              h={250}
              data={dailyData}
              dataKey="date"
              series={[
                { name: "Premium Requests", color: "yellow.6" },
                { name: "Main Sessions", color: "blue.6" },
                { name: "Subagents", color: "violet.6" },
              ]}
              curveType="monotone"
              withDots={dailyData.length <= 30}
              gridAxis="xy"
              tickLine="xy"
            />
          </Paper>
        )}

        {/* ================================================================ */}
        {/* Section 5: Tool Usage                                            */}
        {/* ================================================================ */}
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Paper p="md" withBorder radius="md">
            <Text size="sm" fw={600} mb="md">
              Top Tools
            </Text>
            {toolBarData.length > 0 ? (
              <BarChart
                h={Math.max(200, toolBarData.length * 28)}
                data={toolBarData}
                dataKey="tool"
                series={[
                  { name: "Calls", color: "blue.6" },
                  { name: "Errors", color: "red.6" },
                ]}
                type="stacked"
                orientation="vertical"
                gridAxis="x"
                tickLine="x"
              />
            ) : (
              <Text size="sm" c="dimmed" ta="center" py="xl">
                No tool data
              </Text>
            )}
          </Paper>

          {/* Tool stats table */}
          <Paper p="md" withBorder radius="md">
            <Text size="sm" fw={600} mb="md">
              Tool Performance
            </Text>
            <ScrollArea.Autosize mah={400}>
              <Table striped highlightOnHover fz="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Tool</Table.Th>
                    <Table.Th style={{ textAlign: "right" }}>Calls</Table.Th>
                    <Table.Th style={{ textAlign: "right" }}>Success</Table.Th>
                    <Table.Th style={{ textAlign: "right" }}>Avg Time</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {stats.toolStats.slice(0, 20).map((t) => {
                    const successRate = t.calls > 0
                      ? (t.successes / t.calls) * 100
                      : 0;
                    return (
                      <Table.Tr key={t.tool}>
                        <Table.Td>
                          <Group gap={4} wrap="nowrap">
                            <Wrench size={12} />
                            <Text size="xs" truncate style={{ maxWidth: 150 }}>
                              {t.tool}
                            </Text>
                          </Group>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          {t.calls}
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          <Text
                            size="xs"
                            c={successRate >= 95 ? "green" : successRate >= 80 ? "yellow" : "red"}
                          >
                            {formatPercent(t.calls > 0 ? t.successes / t.calls : 0)}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          {t.avgDurationMs > 0 ? formatDuration(t.avgDurationMs) : "—"}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          </Paper>
        </SimpleGrid>

        {/* ================================================================ */}
        {/* Section 6: Performance & Code Impact                             */}
        {/* ================================================================ */}
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="sm">
          <Paper p="md" withBorder radius="md">
            <Stack gap="xs">
              <Group gap="xs">
                <Clock size={16} />
                <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                  Avg Response Time
                </Text>
              </Group>
              <Text size="lg" fw={700}>
                {stats.avgResponseMs > 0 ? formatDuration(stats.avgResponseMs) : "—"}
              </Text>
            </Stack>
          </Paper>

          <Paper p="md" withBorder radius="md">
            <Stack gap="xs">
              <Group gap="xs">
                <Warning size={16} />
                <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                  Error Rate
                </Text>
              </Group>
              <Text size="lg" fw={700} c={stats.errorRate > 0.05 ? "red" : undefined}>
                {formatPercent(stats.errorRate)}
              </Text>
              <Text size="xs" c="dimmed">
                {stats.errorCount} error{stats.errorCount !== 1 ? "s" : ""} / {stats.totalMessages} messages
              </Text>
            </Stack>
          </Paper>

          <Paper p="md" withBorder radius="md">
            <Stack gap="xs">
              <Group gap="xs">
                <ArrowsClockwise size={16} />
                <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                  Compactions
                </Text>
              </Group>
              <Text size="lg" fw={700}>
                {stats.compactionCount}
              </Text>
              <Text size="xs" c="dimmed">
                {stats.compactionAuto} auto, {stats.compactionCount - stats.compactionAuto} manual
              </Text>
            </Stack>
          </Paper>

          <Paper p="md" withBorder radius="md">
            <Stack gap="xs">
              <Group gap="xs">
                <CodeBlock size={16} />
                <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                  Code Impact
                </Text>
              </Group>
              <Group gap="xs">
                <Text size="lg" fw={700} c="green">
                  +{stats.totalAdditions.toLocaleString()}
                </Text>
                <Text size="lg" fw={700} c="red">
                  -{stats.totalDeletions.toLocaleString()}
                </Text>
              </Group>
              <Text size="xs" c="dimmed">
                across {stats.totalFilesChanged} file{stats.totalFilesChanged !== 1 ? "s" : ""}
              </Text>
            </Stack>
          </Paper>
        </SimpleGrid>

        <Divider />

        {/* Footer */}
        <Text size="xs" c="dimmed" ta="center">
          Aggregated from {stats.totalSessions} sessions ({stats.totalMessages} messages)
          {stats.dailyActivity.length > 0 && (
            <>
              {" "}spanning{" "}
              {stats.dailyActivity[0].date} to{" "}
              {stats.dailyActivity[stats.dailyActivity.length - 1].date}
            </>
          )}
        </Text>
      </Stack>
    </ScrollArea>
  );
}
