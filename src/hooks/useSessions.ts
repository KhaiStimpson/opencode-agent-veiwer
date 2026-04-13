import { useState, useEffect, useCallback, useRef } from "react";
import type { OpencodeClient } from "../lib/opencode";
import type {
  Session,
  SessionNode,
  SessionStatusMap,
  Event,
} from "../types";

interface UseSessionsResult {
  sessions: Session[];
  tree: SessionNode[];
  statusMap: SessionStatusMap;
  selectedId: string | null;
  selectSession: (id: string | null) => void;
  loading: boolean;
  handleEvent: (event: Event) => void;
}

/** Check if any descendant (at any depth) is busy */
function hasActiveBusy(node: SessionNode): boolean {
  if (node.status.type === "busy") return true;
  return node.children.some(hasActiveBusy);
}

function buildTree(
  sessions: Session[],
  statusMap: SessionStatusMap
): SessionNode[] {
  const byId = new Map<string, SessionNode>();

  // Create nodes
  for (const s of sessions) {
    byId.set(s.id, {
      session: s,
      status: statusMap[s.id] || { type: "idle" },
      children: [],
    });
  }

  const roots: SessionNode[] = [];

  // Link parents — works for arbitrary depth
  for (const node of byId.values()) {
    const parentId = node.session.parentID;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort by most recently updated first (recursive)
  const sortNodes = (nodes: SessionNode[]) => {
    nodes.sort(
      (a, b) => b.session.time.updated - a.session.time.updated
    );
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(roots);

  return roots;
}

// How often to poll for session list / status updates (ms)
const POLL_INTERVAL = 3000;

export function useSessions(client: OpencodeClient | null): UseSessionsResult {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [statusMap, setStatusMap] = useState<SessionStatusMap>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  // Shared fetch for initial load and polling
  const fetchSessions = useCallback(async () => {
    if (!client) return null;
    try {
      const [sessRes, statusRes] = await Promise.all([
        client.session.list(),
        client.session.status(),
      ]);
      return {
        sessions: sessRes.data ?? [],
        statusMap: (statusRes.data ?? {}) as SessionStatusMap,
      };
    } catch {
      return null;
    }
  }, [client]);

  // Initial fetch on connect
  useEffect(() => {
    if (!client) {
      setSessions([]);
      setStatusMap({});
      setSelectedId(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      const result = await fetchSessions();
      if (cancelled || !result) {
        if (!cancelled) setLoading(false);
        return;
      }
      setSessions(result.sessions);
      setStatusMap(result.statusMap);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [client, fetchSessions]);

  // Polling fallback — keeps sidebar in sync even if SSE is unreliable
  useEffect(() => {
    if (!client) return;

    const interval = setInterval(async () => {
      const result = await fetchSessions();
      if (!result) return;
      setSessions(result.sessions);
      setStatusMap(result.statusMap);
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [client, fetchSessions]);

  // SSE event handler for lower-latency updates
  const handleEvent = useCallback((event: Event) => {
    switch (event.type) {
      case "session.created":
        setSessions((prev) => {
          const exists = prev.some((s) => s.id === event.properties.info.id);
          if (exists) return prev;
          return [event.properties.info, ...prev];
        });
        break;

      case "session.updated":
        setSessions((prev) =>
          prev.map((s) =>
            s.id === event.properties.info.id ? event.properties.info : s
          )
        );
        break;

      case "session.deleted":
        setSessions((prev) =>
          prev.filter((s) => s.id !== event.properties.info.id)
        );
        setSelectedId((prev) =>
          prev === event.properties.info.id ? null : prev
        );
        break;

      case "session.status":
        setStatusMap((prev) => ({
          ...prev,
          [event.properties.sessionID]: event.properties.status,
        }));
        break;
    }
  }, []);

  const selectSession = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  const tree = buildTree(sessions, statusMap);

  return {
    sessions,
    tree,
    statusMap,
    selectedId,
    selectSession,
    loading,
    handleEvent,
  };
}

export { hasActiveBusy };
