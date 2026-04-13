import { Paper, Group, Text, Badge, Stack, Accordion, Code, Divider } from "@mantine/core";
import { User, Robot, ArrowsClockwise, Lightning } from "@phosphor-icons/react";
import { memo } from "react";
import { ToolCallPartComponent } from "./ToolCallPart";
import { formatRelativeTime, formatTokens } from "../lib/opencode";
import type { Message, Part } from "../types";

interface MessageItemProps {
  info: Message;
  parts: Part[];
  onSelectSession?: (id: string) => void;
}

function MessageItemInner({ info, parts, onSelectSession }: MessageItemProps) {
  const isUser = info.role === "user";

  const textParts = parts.filter((p) => p.type === "text");
  const toolParts = parts.filter((p) => p.type === "tool");
  const agentParts = parts.filter((p) => p.type === "agent");
  const subtaskParts = parts.filter((p) => p.type === "subtask");
  const compactionParts = parts.filter((p) => p.type === "compaction");
  const stepFinishParts = parts.filter((p) => p.type === "step-finish");

  return (
    <Paper
      p="sm"
      withBorder
      radius="sm"
      style={{
        borderLeft: `3px solid var(--mantine-color-${isUser ? "blue" : "green"}-6)`,
      }}
    >
      <Stack gap="xs">
        {/* Header */}
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            {isUser ? (
              <User size={16} weight="bold" />
            ) : (
              <Robot size={16} weight="bold" />
            )}
            <Text size="sm" fw={600}>
              {isUser ? "User" : "Assistant"}
            </Text>
            {!isUser && (
              <Badge size="xs" variant="light" color="gray">
                {info.providerID}/{info.modelID}
              </Badge>
            )}
          </Group>
          <Group gap="xs" wrap="nowrap">
            {!isUser && info.tokens && (
              <Text size="xs" c="dimmed">
                {info.tokens.input + info.tokens.output} tokens
              </Text>
            )}
            <Text size="xs" c="dimmed">
              {formatRelativeTime(info.time.created)}
            </Text>
          </Group>
        </Group>

        {/* Agent parts */}
        {agentParts.length > 0 && (
          <Group gap={4}>
            {agentParts.map((p) =>
              p.type === "agent" ? (
                <Badge key={p.id} size="xs" variant="outline" color="violet">
                  agent: {p.name}
                </Badge>
              ) : null
            )}
          </Group>
        )}

        {/* Text content */}
        {textParts.map((p) =>
          p.type === "text" ? (
            <Text
              key={p.id}
              size="sm"
              style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            >
              {p.text}
            </Text>
          ) : null
        )}

        {/* Subtask parts */}
        {subtaskParts.length > 0 && (
          <Stack gap={4}>
            {subtaskParts.map((p) =>
              p.type === "subtask" ? (
                <Paper
                  key={p.id}
                  p="xs"
                  withBorder
                  radius="sm"
                  style={{ cursor: onSelectSession ? "pointer" : undefined }}
                  onClick={() => {
                    // Subtasks create child sessions - we'd need the child session ID
                    // which may come through session.created events
                  }}
                >
                  <Group gap="xs">
                    <Badge size="xs" color="violet" variant="light">
                      subtask
                    </Badge>
                    <Text size="xs" fw={500}>
                      {p.description}
                    </Text>
                    <Badge size="xs" color="gray" variant="light">
                      agent: {p.agent}
                    </Badge>
                  </Group>
                </Paper>
              ) : null
            )}
          </Stack>
        )}

        {/* Tool calls */}
        {toolParts.length > 0 && (
          <Accordion
            variant="separated"
            radius="sm"
            multiple
            styles={{
              control: { padding: "6px 10px" },
              panel: { padding: "0 10px 10px" },
              item: { borderColor: "var(--mantine-color-default-border)" },
            }}
          >
            {toolParts.map((p) =>
              p.type === "tool" ? (
                <ToolCallPartComponent key={p.id} part={p} />
              ) : null
            )}
          </Accordion>
        )}

        {/* Error */}
        {!isUser && info.error && (
          <Paper p="xs" withBorder radius="sm" bg="red.9" c="red.1">
            <Text size="xs" fw={600}>
              Error: {info.error.name}
            </Text>
            {"data" in info.error && "message" in info.error.data && (
              <Code block mt={4} color="red">
                {String(info.error.data.message)}
              </Code>
            )}
          </Paper>
        )}

        {/* Compaction markers */}
        {compactionParts.length > 0 && (
          <Divider
            label={
              <Group gap={4} wrap="nowrap">
                <ArrowsClockwise size={12} weight="bold" />
                <Text size="xs" fw={600}>
                  Context compacted
                </Text>
                {compactionParts.map((p) =>
                  p.type === "compaction" ? (
                    <Badge
                      key={p.id}
                      size="xs"
                      variant="light"
                      color={p.auto ? "blue" : "violet"}
                    >
                      {p.auto ? "auto" : "manual"}
                    </Badge>
                  ) : null
                )}
              </Group>
            }
            labelPosition="center"
            color="orange"
            variant="dashed"
          />
        )}

        {/* Step-finish token annotations */}
        {stepFinishParts.length > 0 && (
          <Group gap={4} wrap="wrap">
            <Lightning size={12} weight="bold" color="var(--mantine-color-teal-6)" />
            {stepFinishParts.map((p) =>
              p.type === "step-finish" ? (
                <Badge
                  key={p.id}
                  size="xs"
                  variant="light"
                  color="teal"
                >
                  step: {formatTokens(p.tokens.input)} in / {formatTokens(p.tokens.output)} out
                </Badge>
              ) : null
            )}
          </Group>
        )}
      </Stack>
    </Paper>
  );
}

export const MessageItem = memo(MessageItemInner);
