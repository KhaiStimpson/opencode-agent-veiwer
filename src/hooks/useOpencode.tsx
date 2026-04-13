import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { createClient, type OpencodeClient } from "../lib/opencode";
import type { ConnectionState } from "../types";

interface OpencodeContextValue {
  client: OpencodeClient | null;
  connection: ConnectionState;
  connect: (url: string) => Promise<void>;
  disconnect: () => void;
}

const OpencodeContext = createContext<OpencodeContextValue | null>(null);

const STORAGE_KEY = "opencode-viewer-url";

function getStoredUrl(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || "http://localhost:4096";
  } catch {
    return "http://localhost:4096";
  }
}

export function OpencodeProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<OpencodeClient | null>(null);
  const [connection, setConnection] = useState<ConnectionState>({
    status: "disconnected",
    serverUrl: getStoredUrl(),
  });

  const disconnect = useCallback(() => {
    clientRef.current = null;
    setConnection((prev) => ({
      ...prev,
      status: "disconnected",
      version: undefined,
      error: undefined,
    }));
  }, []);

  const connect = useCallback(async (url: string) => {
    const normalized = url.replace(/\/+$/, "");

    setConnection({
      status: "connecting",
      serverUrl: normalized,
    });

    try {
      // Health check via raw fetch since SDK doesn't expose global.health()
      const healthRes = await fetch(`${normalized}/global/health`);
      if (!healthRes.ok) {
        throw new Error(`Server returned ${healthRes.status}`);
      }
      const health = await healthRes.json();

      if (!health.healthy) {
        throw new Error("Server reported unhealthy");
      }

      const client = createClient(normalized);
      clientRef.current = client;

      try {
        localStorage.setItem(STORAGE_KEY, normalized);
      } catch {}

      setConnection({
        status: "connected",
        serverUrl: normalized,
        version: health.version,
      });
    } catch (err) {
      clientRef.current = null;
      setConnection({
        status: "error",
        serverUrl: normalized,
        error: err instanceof Error ? err.message : "Connection failed",
      });
    }
  }, []);

  return (
    <OpencodeContext.Provider
      value={{
        client: clientRef.current,
        connection,
        connect,
        disconnect,
      }}
    >
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
