import {
  AppShell,
  Burger,
  Group,
  LoadingOverlay,
  SegmentedControl,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useCallback, useMemo, useRef, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router";
import { OpencodeProvider, useOpencode } from "./hooks/useOpencode";
import { useEvents } from "./hooks/useEvents";
import { useSessions } from "./hooks/useSessions";
import { useSessionDetail } from "./hooks/useSessionDetail";
import { useProviders } from "./hooks/useProviders";
import { useDashboard } from "./hooks/useDashboard";
import { ConnectionHeader } from "./components/ConnectionHeader";
import { SessionNav } from "./components/SessionNav";
import { SessionDetail } from "./components/SessionDetail";
import { Dashboard } from "./components/Dashboard";
import { EmptyState } from "./components/EmptyState";
import type { Event, SessionStatus, SessionNode } from "./types";

/** Recursively find a session node by ID */
function findSession(
  nodes: SessionNode[],
  id: string,
): SessionNode | null {
  for (const n of nodes) {
    if (n.session.id === id) return n;
    const found = findSession(n.children, id);
    if (found) return found;
  }
  return null;
}

function AppContent() {
  const [navOpened, { toggle: toggleNav }] = useDisclosure(true);
  const { client, connection, connect, disconnect } = useOpencode();
  const navigate = useNavigate();
  const location = useLocation();

  const isDashboard = location.pathname === "/dashboard";

  const isConnected = connection.status === "connected";

  // SSE event stream — called early so sseConnected is available for polling hooks.
  // useEvents uses a ref internally for onEvent, so the callback can be updated below.
  const eventHandlerRef = useRef<(event: Event) => void>(() => {});
  const stableOnEvent = useCallback(
    (event: Event) => eventHandlerRef.current(event),
    [],
  );
  const { sseConnected } = useEvents({
    client: isConnected ? client : null,
    onEvent: stableOnEvent,
    enabled: isConnected,
  });

  const {
    sessions,
    tree,
    statusMap,
    selectedId,
    selectSession,
    loading: sessionsLoading,
    handleEvent: handleSessionEvent,
  } = useSessions(isConnected ? client : null, sseConnected);

  const {
    messages,
    todos,
    loading: detailLoading,
    handleEvent: handleDetailEvent,
  } = useSessionDetail(isConnected ? client : null, selectedId, sseConnected);

  // Keep the event handler ref in sync with the latest handlers
  useEffect(() => {
    eventHandlerRef.current = (event: Event) => {
      handleSessionEvent(event);
      handleDetailEvent(event);
    };
  });

  // Provider/model metadata (context window limits)
  const { modelLimits } = useProviders(isConnected ? client : null);

  // Count active (busy) sessions — memoized to avoid recalculating on every render
  const activeSessions = useMemo(
    () => Object.values(statusMap).filter((s) => s.type === "busy").length,
    [statusMap],
  );

  // Dashboard hook
  const {
    stats: dashboardStats,
    loading: dashboardLoading,
    progress: dashboardProgress,
    refresh: refreshDashboard,
  } = useDashboard(
    isConnected && isDashboard ? client : null,
    isDashboard ? sessions : [],
    activeSessions,
  );

  // Find selected session object — memoized to avoid recursive search on every render
  const selectedNode = useMemo(
    () => (selectedId ? findSession(tree, selectedId) : null),
    [tree, selectedId],
  );
  const selectedSession = selectedNode?.session ?? null;
  const selectedStatus: SessionStatus = selectedId
    ? statusMap[selectedId] || { type: "idle" }
    : { type: "idle" };

  const handleViewChange = (value: string) => {
    navigate(value === "dashboard" ? "/dashboard" : "/");
  };

  return (
    <AppShell
      padding={0}
      header={{ height: 50 }}
      navbar={{
        width: 320,
        breakpoint: "sm",
        collapsed: {
          mobile: !navOpened || isDashboard,
          desktop: !navOpened || isDashboard,
        },
      }}
    >
      <AppShell.Header>
        <Group h="100%" px="xs" wrap="nowrap" justify="space-between">
          <Group wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            {!isDashboard && (
              <Burger
                opened={navOpened}
                onClick={toggleNav}
                size="sm"
              />
            )}
            <ConnectionHeader
              connection={connection}
              onConnect={connect}
              onDisconnect={disconnect}
            />
          </Group>
          {isConnected && (
            <SegmentedControl
              size="xs"
              mr="xs"
              value={isDashboard ? "dashboard" : "sessions"}
              onChange={handleViewChange}
              data={[
                { label: "Sessions", value: "sessions" },
                { label: "Dashboard", value: "dashboard" },
              ]}
            />
          )}
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
            <Routes>
              <Route
                path="/dashboard"
                element={
                  <Dashboard
                    stats={dashboardStats}
                    loading={dashboardLoading}
                    progress={dashboardProgress}
                    onRefresh={refreshDashboard}
                  />
                }
              />
              <Route
                path="*"
                element={
                  <SessionDetail
                    session={selectedSession}
                    status={selectedStatus}
                    messages={messages}
                    todos={todos}
                    loading={detailLoading}
                    modelLimits={modelLimits}
                    onSelectSession={selectSession}
                  />
                }
              />
            </Routes>
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
