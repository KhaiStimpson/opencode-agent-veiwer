import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { createClient, type OpencodeClient } from "../lib/opencode";
import type { ConnectionState } from "../types";

const SERVERS_STORAGE_KEY = "opencode-viewer-servers";
const ACTIVE_STORAGE_KEY = "opencode-viewer-active";
const DEFAULT_URL = "http://localhost:4096";

interface StoredServer {
  id: string;
  url: string;
  label: string;
}

export interface ServerEntry {
  id: string;
  url: string;
  label: string;
  connection: ConnectionState;
  client: OpencodeClient | null;
}

interface OpencodeContextValue {
  servers: ServerEntry[];
  activeServerId: string | null;
  activeClient: OpencodeClient | null;
  activeConnection: ConnectionState | null;
  addServer: (url: string, label?: string) => string;
  removeServer: (id: string) => void;
  connectServer: (id: string, urlHint?: string) => Promise<void>;
  disconnectServer: (id: string) => void;
  setActiveServer: (id: string) => void;
}

const OpencodeContext = createContext<OpencodeContextValue | null>(null);

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function loadInitialServers(): StoredServer[] {
  try {
    const raw = localStorage.getItem(SERVERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredServer[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* storage unavailable */ }

  // Migrate from legacy single-URL storage
  try {
    const legacyUrl = localStorage.getItem("opencode-viewer-url");
    if (legacyUrl) {
      const id = generateId();
      const servers = [{ id, url: legacyUrl, label: legacyUrl }];
      localStorage.setItem(SERVERS_STORAGE_KEY, JSON.stringify(servers));
      return servers;
    }
  } catch { /* storage unavailable */ }

  // Default
  const id = generateId();
  return [{ id, url: DEFAULT_URL, label: DEFAULT_URL }];
}

function loadInitialActiveId(servers: StoredServer[]): string | null {
  try {
    const stored = localStorage.getItem(ACTIVE_STORAGE_KEY);
    if (stored && servers.some((s) => s.id === stored)) return stored;
  } catch { /* storage unavailable */ }
  return servers[0]?.id ?? null;
}

function saveServers(servers: StoredServer[]): void {
  try {
    localStorage.setItem(SERVERS_STORAGE_KEY, JSON.stringify(servers));
  } catch { /* storage unavailable */ }
}

function saveActiveId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_STORAGE_KEY, id);
    else localStorage.removeItem(ACTIVE_STORAGE_KEY);
  } catch { /* storage unavailable */ }
}

export function OpencodeProvider({ children }: { children: ReactNode }) {
  const storedRef = useRef(loadInitialServers());

  const [servers, setServers] = useState<ServerEntry[]>(() =>
    storedRef.current.map((s) => ({
      ...s,
      connection: { status: "disconnected", serverUrl: s.url },
      client: null,
    })),
  );
  const [activeServerId, setActiveServerIdState] = useState<string | null>(
    () => loadInitialActiveId(storedRef.current),
  );

  // Keep a ref so async callbacks can read the latest servers without a stale closure
  const serversRef = useRef(servers);
  serversRef.current = servers;

  const connectServer = useCallback(
    async (id: string, urlHint?: string) => {
      const server = serversRef.current.find((s) => s.id === id);
      const resolvedUrl = server?.url ?? urlHint;
      if (!resolvedUrl) return;
      const normalized = resolvedUrl.replace(/\/+$/, "");

      setServers((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, client: null, connection: { status: "connecting", serverUrl: normalized } }
            : s,
        ),
      );

      try {
        const healthRes = await fetch(`${normalized}/global/health`);
        if (!healthRes.ok) {
          throw new Error(`Server returned ${healthRes.status}`);
        }
        const health = await healthRes.json();
        if (!health.healthy) {
          throw new Error("Server reported unhealthy");
        }

        const client = createClient(normalized);

        setServers((prev) =>
          prev.map((s) =>
            s.id === id
              ? {
                  ...s,
                  client,
                  connection: {
                    status: "connected",
                    serverUrl: normalized,
                    version: health.version,
                  },
                }
              : s,
          ),
        );
      } catch (err) {
        setServers((prev) =>
          prev.map((s) =>
            s.id === id
              ? {
                  ...s,
                  client: null,
                  connection: {
                    status: "error",
                    serverUrl: normalized,
                    error: err instanceof Error ? err.message : "Connection failed",
                  },
                }
              : s,
          ),
        );
      }
    },
    [],
  );

  const disconnectServer = useCallback((id: string) => {
    setServers((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              client: null,
              connection: {
                ...s.connection,
                status: "disconnected",
                version: undefined,
                error: undefined,
              },
            }
          : s,
      ),
    );
  }, []);

  const addServer = useCallback((url: string, label?: string): string => {
    const normalized = url.replace(/\/+$/, "");
    const id = generateId();
    const entry: ServerEntry = {
      id,
      url: normalized,
      label: label ?? normalized,
      connection: { status: "disconnected", serverUrl: normalized },
      client: null,
    };
    setServers((prev) => {
      const next = [...prev, entry];
      saveServers(next.map((s) => ({ id: s.id, url: s.url, label: s.label })));
      return next;
    });
    return id;
  }, []);

  const removeServer = useCallback((id: string) => {
    setServers((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveServers(next.map((s) => ({ id: s.id, url: s.url, label: s.label })));
      return next;
    });
    setActiveServerIdState((prev) => {
      if (prev !== id) return prev;
      const remaining = serversRef.current.filter((s) => s.id !== id);
      const newActive = remaining[0]?.id ?? null;
      saveActiveId(newActive);
      return newActive;
    });
  }, []);

  const setActiveServer = useCallback((id: string) => {
    setActiveServerIdState(id);
    saveActiveId(id);
  }, []);

  const activeServer = servers.find((s) => s.id === activeServerId) ?? null;
  const activeClient = activeServer?.client ?? null;
  const activeConnection = activeServer?.connection ?? null;

  const value = useMemo<OpencodeContextValue>(
    () => ({
      servers,
      activeServerId,
      activeClient,
      activeConnection,
      addServer,
      removeServer,
      connectServer,
      disconnectServer,
      setActiveServer,
    }),
    [
      servers,
      activeServerId,
      activeClient,
      activeConnection,
      addServer,
      removeServer,
      connectServer,
      disconnectServer,
      setActiveServer,
    ],
  );

  return (
    <OpencodeContext.Provider value={value}>
      {children}
    </OpencodeContext.Provider>
  );
}

export function useOpencode(): OpencodeContextValue {
  const ctx = useContext(OpencodeContext);
  if (!ctx) {
    throw new Error("useOpencode must be used within OpencodeProvider");
  }
  return ctx;
}
