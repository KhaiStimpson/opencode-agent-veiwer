import { Accordion, Badge, Code, Group, Text, Stack } from "@mantine/core";
import {
  CheckCircle,
  XCircle,
  Spinner,
  Clock,
} from "@phosphor-icons/react";
import { memo } from "react";
import type { ToolPart } from "@opencode-ai/sdk";

interface ToolCallPartProps {
  part: ToolPart;
}

function ToolStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle size={14} weight="fill" color="var(--mantine-color-green-6)" />;
    case "error":
      return <XCircle size={14} weight="fill" color="var(--mantine-color-red-6)" />;
    case "running":
      return <Spinner size={14} className="spin-animation" color="var(--mantine-color-blue-6)" />;
    case "pending":
    default:
      return <Clock size={14} color="var(--mantine-color-gray-6)" />;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return "green";
    case "error":
      return "red";
    case "running":
      return "blue";
    default:
      return "gray";
  }
}

function formatDuration(start: number, end?: number): string {
  if (!end) return "...";
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function ToolCallPartInner({ part }: ToolCallPartProps) {
  const { state, tool } = part;
  const title = "title" in state && state.title ? state.title : tool;
  const hasTime = "time" in state && state.time;

  return (
    <Accordion.Item value={part.id}>
      <Accordion.Control>
        <Group gap="xs" wrap="nowrap">
          <ToolStatusIcon status={state.status} />
          <Text size="sm" fw={500} truncate style={{ flex: 1 }}>
            {title}
          </Text>
          <Badge size="xs" color={statusColor(state.status)} variant="light">
            {state.status}
          </Badge>
          {hasTime && (
            <Text size="xs" c="dimmed">
              {formatDuration(
                state.time.start,
                "end" in state.time ? state.time.end : undefined
              )}
            </Text>
          )}
        </Group>
      </Accordion.Control>
      <Accordion.Panel>
        <Stack gap="xs">
          {state.input && Object.keys(state.input).length > 0 && (
            <div>
              <Text size="xs" fw={600} c="dimmed" mb={4}>
                Input
              </Text>
              <Code block style={{ maxHeight: 200, overflow: "auto" }}>
                {JSON.stringify(state.input, null, 2)}
              </Code>
            </div>
          )}
          {"output" in state && state.output && (
            <div>
              <Text size="xs" fw={600} c="dimmed" mb={4}>
                Output
              </Text>
              <Code block style={{ maxHeight: 300, overflow: "auto" }}>
                {state.output.length > 5000
                  ? state.output.slice(0, 5000) + "\n... (truncated)"
                  : state.output}
              </Code>
            </div>
          )}
          {"error" in state && state.error && (
            <div>
              <Text size="xs" fw={600} c="red" mb={4}>
                Error
              </Text>
              <Code block color="red">
                {state.error}
              </Code>
            </div>
          )}
        </Stack>
      </Accordion.Panel>
    </Accordion.Item>
  );
}

export const ToolCallPartComponent = memo(ToolCallPartInner);
