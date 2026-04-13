import { useState, useEffect, useCallback, useRef } from "react";
import type { OpencodeClient } from "../lib/opencode";
import type { Message, Part, Todo, Event } from "../types";

interface MessageWithParts {
  info: Message;
  parts: Part[];
}

interface UseSessionDetailResult {
  messages: MessageWithParts[];
  todos: Todo[];
  loading: boolean;
  handleEvent: (event: Event) => void;
}

// How often to poll for updates (ms)
const POLL_INTERVAL = 2000;

export function useSessionDetail(
  client: OpencodeClient | null,
  sessionId: string | null
): UseSessionDetailResult {
  const [messages, setMessages] = useState<MessageWithParts[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const currentSessionRef = useRef(sessionId);
  currentSessionRef.current = sessionId;

  // Shared fetch function used by both initial load and polling
  const fetchDetail = useCallback(
    async (sid: string, signal?: AbortSignal) => {
      if (!client) return null;
      try {
        const [msgRes, todoRes] = await Promise.all([
          client.session.messages({ path: { id: sid } }),
          client.session
            .todo({ path: { id: sid } })
            .catch(() => ({ data: [] })),
        ]);
        if (signal?.aborted) return null;
        return {
          messages: (msgRes.data ?? []) as MessageWithParts[],
          todos: (todoRes.data ?? []) as Todo[],
        };
      } catch {
        return null;
      }
    },
    [client]
  );

  // Initial fetch when session changes
  useEffect(() => {
    if (!client || !sessionId) {
      setMessages([]);
      setTodos([]);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      const result = await fetchDetail(sessionId!);
      if (cancelled || !result) {
        if (!cancelled) setLoading(false);
        return;
      }
      setMessages(result.messages);
      setTodos(result.todos);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [client, sessionId, fetchDetail]);

  // Polling: re-fetch messages periodically for the active session.
  // This ensures updates even if the SSE stream isn't delivering events.
  useEffect(() => {
    if (!client || !sessionId) return;

    const interval = setInterval(async () => {
      const sid = currentSessionRef.current;
      if (!sid) return;
      const result = await fetchDetail(sid);
      if (!result || sid !== currentSessionRef.current) return;
      setMessages(result.messages);
      setTodos(result.todos);
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [client, sessionId, fetchDetail]);

  // Also handle SSE events for lower-latency updates
  const handleEvent = useCallback(
    (event: Event) => {
      if (!sessionId) return;

      switch (event.type) {
        case "message.updated": {
          const msg = event.properties.info;
          if (msg.sessionID !== sessionId) return;

          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.info.id === msg.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = { ...updated[idx], info: msg };
              return updated;
            }
            return [...prev, { info: msg, parts: [] }];
          });
          break;
        }

        case "message.part.updated": {
          const part = event.properties.part;
          if (part.sessionID !== sessionId) return;

          setMessages((prev) => {
            const msgIdx = prev.findIndex(
              (m) => m.info.id === part.messageID
            );
            if (msgIdx < 0) return prev;

            const updated = [...prev];
            const msg = { ...updated[msgIdx] };
            const partIdx = msg.parts.findIndex((p) => p.id === part.id);

            if (partIdx >= 0) {
              msg.parts = [...msg.parts];
              msg.parts[partIdx] = part;
            } else {
              msg.parts = [...msg.parts, part];
            }

            updated[msgIdx] = msg;
            return updated;
          });
          break;
        }

        case "message.removed": {
          if (event.properties.sessionID !== sessionId) return;
          setMessages((prev) =>
            prev.filter((m) => m.info.id !== event.properties.messageID)
          );
          break;
        }

        case "message.part.removed": {
          if (event.properties.sessionID !== sessionId) return;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.info.id !== event.properties.messageID) return m;
              return {
                ...m,
                parts: m.parts.filter(
                  (p) => p.id !== event.properties.partID
                ),
              };
            })
          );
          break;
        }

        case "todo.updated": {
          if (event.properties.sessionID !== sessionId) return;
          setTodos(event.properties.todos);
          break;
        }
      }
    },
    [sessionId]
  );

  return { messages, todos, loading, handleEvent };
}
