import {
  Stack,
  Group,
  Text,
  Badge,
  Tabs,
  Divider,
  ScrollArea,
} from "@mantine/core";
import {
  ChatText,
  ListChecks,
  Info,
} from "@phosphor-icons/react";
import { StatusBadge } from "./StatusBadge";
import { MessageList } from "./MessageList";
import { TodoList } from "./TodoList";
import { TokenSummary } from "./TokenSummary";
import { EmptyState } from "./EmptyState";
import { formatRelativeTime } from "../lib/opencode";
import type { Session, SessionStatus, Message, Part, Todo } from "../types";

interface MessageWithParts {
  info: Message;
  parts: Part[];
}

interface SessionDetailProps {
  session: Session | null;
  status: SessionStatus;
  messages: MessageWithParts[];
  todos: Todo[];
  loading: boolean;
  onSelectSession?: (id: string) => void;
}

export function SessionDetail({
  session,
  status,
  messages,
  todos,
  loading,
  onSelectSession,
}: SessionDetailProps) {
  if (!session) {
    return (
      <EmptyState
        title="No session selected"
        description="Select a session from the sidebar to view its messages and progress"
      />
    );
  }

  const activeTodos = todos.filter(
    (t) => t.status === "in_progress" || t.status === "pending"
  );

  return (
    <Stack gap={0} h="100%">
      {/* Session Header */}
      <Stack gap="xs" p="md" pb="sm">
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Text size="lg" fw={700} truncate style={{ flex: 1 }}>
            {session.title || `Session ${session.id.slice(0, 8)}`}
          </Text>
          <StatusBadge status={status} />
        </Group>

        <Group gap="xs" wrap="wrap">
          <Badge size="xs" variant="light" color="gray">
            {session.id.slice(0, 12)}...
          </Badge>
          {session.parentID && (
            <Badge
              size="xs"
              variant="light"
              color="violet"
              style={{ cursor: "pointer" }}
              onClick={() => onSelectSession?.(session.parentID!)}
            >
              child of {session.parentID.slice(0, 8)}
            </Badge>
          )}
          <Text size="xs" c="dimmed">
            Created {formatRelativeTime(session.time.created)}
          </Text>
          {session.summary && (
            <Badge size="xs" variant="light" color="green">
              +{session.summary.additions} -{session.summary.deletions} in{" "}
              {session.summary.files} files
            </Badge>
          )}
        </Group>

        <Divider />
      </Stack>

      {/* Tabbed Content */}
      <Tabs defaultValue="messages" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Tabs.List px="md">
          <Tabs.Tab
            value="messages"
            leftSection={<ChatText size={14} />}
          >
            Messages ({messages.length})
          </Tabs.Tab>
          <Tabs.Tab
            value="todos"
            leftSection={<ListChecks size={14} />}
            rightSection={
              activeTodos.length > 0 ? (
                <Badge size="xs" color="blue" variant="filled" circle>
                  {activeTodos.length}
                </Badge>
              ) : undefined
            }
          >
            Todos
          </Tabs.Tab>
          <Tabs.Tab value="info" leftSection={<Info size={14} />}>
            Info
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel
          value="messages"
          style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex" }}
        >
          <MessageList
            messages={messages}
            loading={loading}
            onSelectSession={onSelectSession}
          />
        </Tabs.Panel>

        <Tabs.Panel value="todos" style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex" }}>
          <ScrollArea p="md" style={{ flex: 1 }} offsetScrollbars>
            <TodoList todos={todos} />
          </ScrollArea>
        </Tabs.Panel>

        <Tabs.Panel value="info" style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex" }}>
          <ScrollArea p="md" style={{ flex: 1 }} offsetScrollbars>
            <TokenSummary messages={messages} session={session} />
          </ScrollArea>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
