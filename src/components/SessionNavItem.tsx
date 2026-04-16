import { NavLink, Badge, Loader, Box } from "@mantine/core";
import { memo } from "react";

import type { SessionNode } from "../types";
import { formatRelativeTime } from "../lib/opencode";
import { hasActiveBusy } from "../hooks/useSessions";

interface SessionNavItemProps {
  node: SessionNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth?: number;
}

function SessionNavItemInner({
  node,
  selectedId,
  onSelect,
  depth = 0,
}: SessionNavItemProps) {
  const { session, status, children } = node;
  const isBusy = status.type === "busy";
  const isRetry = status.type === "retry";

  const leftSection = isBusy ? (
    <Loader size={10} color="var(--oc-amber)" />
  ) : (
    <Box
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: isRetry
          ? "var(--oc-amber-dim)"
          : "var(--oc-text-muted)",
        boxShadow: isBusy
          ? "0 0 6px var(--oc-amber)"
          : isRetry
            ? "0 0 4px var(--oc-amber-dim)"
            : "none",
        opacity: isBusy || isRetry ? 1 : 0.4,
        transition: "all 0.3s ease",
      }}
    />
  );

  return (
    <NavLink
      label={session.title || `Session ${session.id.slice(0, 8)}`}
      description={formatRelativeTime(session.time.updated)}
      leftSection={leftSection}
      rightSection={
        children.length > 0 ? (
          <Badge
            size="xs"
            variant="light"
            color="gray"
            circle
            styles={{
              root: {
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid var(--oc-border)",
                color: "var(--oc-text-muted)",
              },
            }}
          >
            {children.length}
          </Badge>
        ) : undefined
      }
      active={session.id === selectedId}
      onClick={() => onSelect(session.id)}
      childrenOffset={depth < 3 ? 20 : 0}
      defaultOpened={hasActiveBusy(node)}
      variant="subtle"
    >
      {children.map((child) => (
        <SessionNavItem
          key={child.session.id}
          node={child}
          selectedId={selectedId}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ))}
    </NavLink>
  );
}

export const SessionNavItem = memo(SessionNavItemInner);
