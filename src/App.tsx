import { AppShell, Burger, Group, LoadingOverlay } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";
import { OpencodeProvider, useOpencode } from "./hooks/useOpencode";
import { useEvents } from "./hooks/useEvents";
import { useSessions } from "./hooks/useSessions";
import { useSessionDetail } from "./hooks/useSessionDetail";
import { ConnectionHeader } from "./components/ConnectionHeader";
import { SessionNav } from "./components/SessionNav";
import { SessionDetail } from "./components/SessionDetail";
import { EmptyState } from "./components/EmptyState";
import type { Event, SessionStatus } from "./types";

function AppContent() {
  const [navOpened, { toggle: toggleNav }] = useDisclosure(true);
  const { client, connection, connect, disconnect } = useOpencode();

  const isConnected = connection.status === "connected";
  const {
    tree,
    statusMap,
    selectedId,
    selectSession,
    loading: sessionsLoading,
    handleEvent: handleSessionEvent,
  } = useSessions(isConnected ? client : null);

  const {
    messages,
    todos,
    loading: detailLoading,
    handleEvent: handleDetailEvent,
  } = useSessionDetail(isConnected ? client : null, selectedId);

  // Combined event handler
  const onEvent = useCallback(
    (event: Event) => {
      handleSessionEvent(event);
      handleDetailEvent(event);
    },
    [handleSessionEvent, handleDetailEvent]
  );

  useEvents({
    client: isConnected ? client : null,
    onEvent,
    enabled: isConnected,
  });

  // Find selected session object
  const findSession = (
    nodes: typeof tree,
    id: string
  ): (typeof tree)[0] | null => {
    for (const n of nodes) {
      if (n.session.id === id) return n;
      const found = findSession(n.children, id);
      if (found) return found;
    }
    return null;
  };

  const selectedNode = selectedId ? findSession(tree, selectedId) : null;
  const selectedSession = selectedNode?.session ?? null;
  const selectedStatus: SessionStatus = selectedId
    ? statusMap[selectedId] || { type: "idle" }
    : { type: "idle" };

  return (
    <AppShell
      padding={0}
      header={{ height: 50 }}
      navbar={{
        width: 320,
        breakpoint: "sm",
        collapsed: { mobile: !navOpened, desktop: !navOpened },
      }}
    >
      <AppShell.Header>
        <Group h="100%" px="xs" wrap="nowrap">
          <Burger
            opened={navOpened}
            onClick={toggleNav}
            size="sm"
          />
          <ConnectionHeader
            connection={connection}
            onConnect={connect}
            onDisconnect={disconnect}
          />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        {isConnected ? (
          <SessionNav
            tree={tree}
            selectedId={selectedId}
            onSelect={selectSession}
            loading={sessionsLoading}
          />
        ) : (
          <EmptyState
            title="Not connected"
            description="Connect to an OpenCode server to see sessions"
          />
        )}
      </AppShell.Navbar>

      <AppShell.Main
        style={{ height: "calc(100dvh - 50px)", display: "flex" }}
      >
        <div style={{ flex: 1, position: "relative", overflow: "hidden", height: "100%" }}>
          <LoadingOverlay
            visible={connection.status === "connecting"}
            zIndex={1000}
            overlayProps={{ blur: 2 }}
          />
          {isConnected ? (
            <SessionDetail
              session={selectedSession}
              status={selectedStatus}
              messages={messages}
              todos={todos}
              loading={detailLoading}
              onSelectSession={selectSession}
            />
          ) : (
            <EmptyState
              title="Welcome to OpenCode Agent Viewer"
              description="Enter your OpenCode server URL above and click Connect to start monitoring sessions"
            />
          )}
        </div>
      </AppShell.Main>
    </AppShell>
  );
}

export function App() {
  return (
    <OpencodeProvider>
      <AppContent />
    </OpencodeProvider>
  );
}
