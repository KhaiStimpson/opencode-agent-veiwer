import { useEffect, useRef, useCallback } from "react";
import { notifications } from "@mantine/notifications";
import type { OpencodeClient } from "../lib/opencode";
import type { Event } from "@opencode-ai/sdk";

type EventHandler = (event: Event) => void;

interface UseEventsOptions {
  client: OpencodeClient | null;
  onEvent: EventHandler;
  enabled?: boolean;
}

export function useEvents({ client, onEvent, enabled = true }: UseEventsOptions) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!client || !enabled) {
      stop();
      return;
    }

    let cancelled = false;

    async function startStream() {
      while (!cancelled) {
        try {
          console.log("[SSE] Connecting to event stream...");
          const result = await client!.event.subscribe();
          console.log("[SSE] Connected, waiting for events...");

          let eventCount = 0;
          for await (const event of result.stream) {
            if (cancelled) break;
            eventCount++;
            if (eventCount <= 5 || eventCount % 50 === 0) {
              console.log(`[SSE] Event #${eventCount}:`, event.type);
            }
            onEventRef.current(event as Event);
          }

          console.log(`[SSE] Stream ended after ${eventCount} events`);
        } catch (err) {
          if (cancelled) break;

          const msg = err instanceof Error ? err.message : "SSE connection error";
          console.warn("[SSE] Error:", msg);

          if (!msg.includes("abort")) {
            notifications.show({
              title: "Connection lost",
              message: `Event stream disconnected: ${msg}. Retrying...`,
              color: "yellow",
              autoClose: 3000,
            });
          }

          // Wait before reconnecting
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }

    startStream();

    return () => {
      cancelled = true;
      stop();
    };
  }, [client, enabled, stop]);

  return { stop };
}
