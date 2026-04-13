import { Stack, Group, Text, Progress, Badge, Paper } from "@mantine/core";
import {
  CheckCircle,
  Circle,
  ArrowRight,
  XCircle,
} from "@phosphor-icons/react";
import type { Todo } from "../types";

interface TodoListProps {
  todos: Todo[];
}

function statusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle size={14} weight="fill" color="var(--mantine-color-green-6)" />;
    case "in_progress":
      return <ArrowRight size={14} weight="bold" color="var(--mantine-color-blue-6)" />;
    case "cancelled":
      return <XCircle size={14} weight="fill" color="var(--mantine-color-gray-6)" />;
    default:
      return <Circle size={14} color="var(--mantine-color-gray-6)" />;
  }
}

function priorityColor(priority: string): string {
  switch (priority) {
    case "high":
      return "red";
    case "medium":
      return "yellow";
    default:
      return "gray";
  }
}

export function TodoList({ todos }: TodoListProps) {
  if (todos.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        No todos for this session
      </Text>
    );
  }

  const completed = todos.filter((t) => t.status === "completed").length;
  const total = todos.filter((t) => t.status !== "cancelled").length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Stack gap="sm">
      <Group gap="xs" justify="space-between">
        <Text size="sm" fw={500}>
          Progress
        </Text>
        <Text size="xs" c="dimmed">
          {completed}/{total} ({percent}%)
        </Text>
      </Group>
      <Progress value={percent} size="sm" color="green" />

      <Stack gap={4}>
        {todos.map((todo) => (
          <Paper key={todo.id} p="xs" withBorder radius="sm">
            <Group gap="xs" wrap="nowrap">
              {statusIcon(todo.status)}
              <Text
                size="sm"
                style={{ flex: 1 }}
                td={todo.status === "cancelled" ? "line-through" : undefined}
                c={todo.status === "cancelled" ? "dimmed" : undefined}
              >
                {todo.content}
              </Text>
              <Badge
                size="xs"
                color={priorityColor(todo.priority)}
                variant="light"
              >
                {todo.priority}
              </Badge>
            </Group>
          </Paper>
        ))}
      </Stack>
    </Stack>
  );
}
