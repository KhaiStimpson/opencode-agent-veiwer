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
// When SSE is healthy, poll much less frequently (fallback safety net).
const POLL_INTERVAL_SSE = 30_000;
const POLL_INTERVAL_NO_SSE = 2000;

/** Lightweight fingerprint for a message list. Captures message IDs, part
 *  counts, and creation timestamps so we can skip setState when
 *  nothing actually changed. */
function messagesFingerprint(msgs: MessageWithParts[]): string {
  return msgs
    .map((m) => `${m.info.id}:${m.parts.length}:${m.info.time.created}`)
    .join("|");
}

/** Fingerprint for todos. */
function todosFingerprint(todos: Todo[]): string {
  return todos.map((t) => `${t.id}:${t.status}`).join("|");
}

export function useSessionDetail(
  client: OpencodeClient | null,
  sessionId: string | null,
  sseConnected: boolean,
): UseSessionDetailResult {
  const [messages, setMessages] = useState<MessageWithParts[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const currentSessionRef = useRef(sessionId);
  currentSessionRef.current = sessionId;
  const lastMsgsFpRef = useRef("");
  const lastTodosFpRef = useRef("");

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
      lastMsgsFpRef.current = "";
      lastTodosFpRef.current = "";
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
  // When SSE is healthy, poll infrequently as a safety net.
  useEffect(() => {
    if (!client || !sessionId) return;

    const interval = setInterval(async () => {
      const sid = currentSessionRef.current;
      if (!sid) return;
      const result = await fetchDetail(sid);
      if (!result || sid !== currentSessionRef.current) return;

      // Skip setState if nothing actually changed — avoids cascading re-renders
      const newMsgsFp = messagesFingerprint(result.messages);
      const newTodosFp = todosFingerprint(result.todos);

      if (newMsgsFp !== lastMsgsFpRef.current) {
        lastMsgsFpRef.current = newMsgsFp;
        setMessages(result.messages);
      }
      if (newTodosFp !== lastTodosFpRef.current) {
        lastTodosFpRef.current = newTodosFp;
        setTodos(result.todos);
      }
    }, sseConnected ? POLL_INTERVAL_SSE : POLL_INTERVAL_NO_SSE);

    return () => clearInterval(interval);
  }, [client, sessionId, fetchDetail, sseConnected]);

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

        case "session.compacted": {
          // After compaction, old messages are removed and a summary replaces
          // them. Re-fetch the full message list to get the updated state.
          if (event.properties.sessionID !== sessionId) return;
          fetchDetail(sessionId).then((result) => {
            if (!result || currentSessionRef.current !== sessionId) return;
            setMessages(result.messages);
            setTodos(result.todos);
          });
          break;
        }
      }
    },
    [sessionId, fetchDetail]
  );

  return { messages, todos, loading, handleEvent };
}
