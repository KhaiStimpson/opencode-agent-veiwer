import { Stack, ScrollArea, Skeleton } from "@mantine/core";
import { useRef, useEffect, useCallback } from "react";
import { MessageItem } from "./MessageItem";
import type { Message, Part } from "../types";

interface MessageWithParts {
  info: Message;
  parts: Part[];
}

interface MessageListProps {
  messages: MessageWithParts[];
  loading: boolean;
  onSelectSession?: (id: string) => void;
}

export function MessageList({
  messages,
  loading,
  onSelectSession,
}: MessageListProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  // Track whether user has scrolled up (away from bottom).
  // If so, don't auto-scroll — let them read in peace.
  const handleScrollPositionChange = useCallback(
    ({ y }: { x: number; y: number }) => {
      const vp = viewportRef.current;
      if (!vp) return;
      // Consider "at bottom" if within 150px of the end
      const atBottom = vp.scrollHeight - y - vp.clientHeight < 150;
      shouldAutoScrollRef.current = atBottom;
    },
    []
  );

  // Scroll to bottom whenever messages change (new messages, updated parts, etc.)
  // but only if the user hasn't scrolled up.
  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const vp = viewportRef.current;
    if (!vp) return;

    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      vp.scrollTo({ top: vp.scrollHeight, behavior: "smooth" });
    });
  }, [messages]);

  // On initial load or session switch, always scroll to bottom
  useEffect(() => {
    shouldAutoScrollRef.current = true;
    const vp = viewportRef.current;
    if (!vp) return;
    requestAnimationFrame(() => {
      vp.scrollTo({ top: vp.scrollHeight });
    });
  }, [messages.length > 0 ? messages[0]?.info.sessionID : null]);

  if (loading) {
    return (
      <Stack gap="sm" p="sm">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} height={100} radius="sm" />
        ))}
      </Stack>
    );
  }

  return (
    <ScrollArea
      viewportRef={viewportRef}
      onScrollPositionChange={handleScrollPositionChange}
      style={{ flex: 1, minHeight: 0 }}
      offsetScrollbars
    >
      <Stack gap="sm" p="sm">
        {messages.map((msg) => (
          <MessageItem
            key={msg.info.id}
            info={msg.info}
            parts={msg.parts}
            onSelectSession={onSelectSession}
          />
        ))}
      </Stack>
    </ScrollArea>
  );
}
