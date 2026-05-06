import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { ServerEntry } from "./useOpencode";
import type { Session } from "../types";
import {
  aggregateStats,
  type DashboardStats,
  type MessageWithParts,
  type UseDashboardResult,
} from "./useDashboard";
import { type DateRange, isInDateRange } from "../lib/dateRange";

// How many sessions to fetch messages for concurrently per server
const BATCH_SIZE = 5;

// Per-server poll interval for sessions (ms) when the dashboard is open
const POLL_INTERVAL = 30_000;

/** Key for the message cache: server id + session id */
function cacheKey(serverId: string, sessionId: string): string {
  return `${serverId}::${sessionId}`;
}

export function useMultiServerDashboard(
  servers: ServerEntry[],
  enabled: boolean,
  dateRange: DateRange,
): UseDashboardResult {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // Shared message cache keyed by "<serverId>::<sessionId>"
  const cacheRef = useRef(new Map<string, MessageWithParts[]>());
  const fetchingRef = useRef(false);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  // Raw fetched data — re-aggregated whenever dateRange changes without refetching
  const [rawData, setRawData] = useState<{
    sessions: Session[];
    messages: Map<string, MessageWithParts[]>;
    activeSessions: number;
  } | null>(null);

  // Snapshot of connected servers for use inside async effects without stale closures
  const connectedServers = servers.filter((s) => s.client !== null);

  const runFetch = useCallback(
    async (signal: AbortSignal) => {
      if (connectedServers.length === 0) return;
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      setLoading(true);

      // Step 1 — fetch session lists from all connected servers in parallel
      const serverSessionPairs = await Promise.all(
        connectedServers.map(async (server) => {
          try {
            const [sessRes, statusRes] = await Promise.all([
              server.client!.session.list(),
              server.client!.session.status(),
            ]);
            const sessions = (sessRes.data ?? []) as Session[];
            const statusMap = (statusRes.data ?? {}) as Record<
              string,
              { type: string }
            >;
            return { server, sessions, statusMap };
          } catch {
            return { server, sessions: [] as Session[], statusMap: {} };
          }
        }),
      );

      if (signal.aborted) {
        fetchingRef.current = false;
        return;
      }

      // Step 2 — compute total active sessions and build a flat session list
      // annotated with which server to use for message fetching
      let totalActiveSessions = 0;
      const allSessionPairs: Array<{ serverId: string; session: Session; client: NonNullable<ServerEntry["client"]> }> = [];

      for (const { server, sessions, statusMap } of serverSessionPairs) {
        for (const [, status] of Object.entries(statusMap)) {
          if (status.type === "busy") totalActiveSessions++;
        }
        for (const session of sessions) {
          allSessionPairs.push({
            serverId: server.id,
            session,
            client: server.client!,
          });
        }
      }

      // Step 3 — fetch messages for all sessions (with per-server caching)
      const cache = cacheRef.current;
      const totalSessions = allSessionPairs.length;
      setProgress({ done: 0, total: totalSessions });

      let done = 0;
      for (let i = 0; i < allSessionPairs.length; i += BATCH_SIZE) {
        if (signal.aborted) break;
        const batch = allSessionPairs.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map(async ({ serverId, session, client }) => {
            const key = cacheKey(serverId, session.id);
            if (cache.has(key)) return;
            try {
              const res = await client.session.messages({
                path: { id: session.id },
              });
              cache.set(key, (res.data ?? []) as MessageWithParts[]);
            } catch {
              cache.set(key, []);
            }
          }),
        );

        done += batch.length;
        if (!signal.aborted) {
          setProgress({ done: Math.min(done, totalSessions), total: totalSessions });
        }
      }

      if (signal.aborted) {
        fetchingRef.current = false;
        return;
      }

      // Step 4 — store raw data (full unfiltered set); aggregation is derived via useMemo
      const flatSessions = allSessionPairs.map((p) => p.session);
      const allMessages = new Map<string, MessageWithParts[]>();
      for (const { serverId, session } of allSessionPairs) {
        allMessages.set(session.id, cache.get(cacheKey(serverId, session.id)) ?? []);
      }

      setRawData({ sessions: flatSessions, messages: allMessages, activeSessions: totalActiveSessions });
      setLoading(false);
      fetchingRef.current = false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connectedServers.map((s) => s.id).join(","), fetchTrigger],
  );

  // Derive stats from raw data + current date range (no network call on range change)
  const filteredStats = useMemo((): DashboardStats | null => {
    if (!rawData) return null;
    const filtered = rawData.sessions.filter((s) =>
      isInDateRange(s.time.created, dateRange),
    );
    const filteredMessages = new Map<string, MessageWithParts[]>();
    for (const s of filtered) {
      filteredMessages.set(s.id, rawData.messages.get(s.id) ?? []);
    }
    return aggregateStats(filtered, filteredMessages, rawData.activeSessions);
  }, [rawData, dateRange]);

  // Main effect: fetch on mount / server change / trigger, then re-poll
  useEffect(() => {
    if (!enabled || connectedServers.length === 0) return;

    const controller = new AbortController();

    runFetch(controller.signal);

    const interval = setInterval(() => {
      if (!fetchingRef.current) {
        runFetch(controller.signal);
      }
    }, POLL_INTERVAL);

    return () => {
      controller.abort();
      clearInterval(interval);
      fetchingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, runFetch]);

  const refresh = useCallback(() => {
    cacheRef.current.clear();
    setFetchTrigger((c) => c + 1);
  }, []);

  return { stats: filteredStats, loading, progress, refresh };
}
