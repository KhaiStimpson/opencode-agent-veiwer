import { NavLink, Badge, Loader } from "@mantine/core";

import type { SessionNode } from "../types";
import { formatRelativeTime } from "../lib/opencode";
import { hasActiveBusy } from "../hooks/useSessions";

interface SessionNavItemProps {
  node: SessionNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth?: number;
}

export function SessionNavItem({
  node,
  selectedId,
  onSelect,
  depth = 0,
}: SessionNavItemProps) {
  const { session, status, children } = node;
  const isBusy = status.type === "busy";
  const isRetry = status.type === "retry";

  const statusColor = isBusy ? "blue" : isRetry ? "yellow" : "gray";

  const leftSection = isBusy ? (
    <Loader size={12} color="blue" />
  ) : (
    <Badge
      size="xs"
      circle
      color={statusColor}
      variant="filled"
      styles={{ root: { width: 10, height: 10, minWidth: 10, padding: 0 } }}
    >
      {" "}
    </Badge>
  );

  return (
    <NavLink
      label={session.title || `Session ${session.id.slice(0, 8)}`}
      description={formatRelativeTime(session.time.updated)}
      leftSection={leftSection}
      rightSection={
        children.length > 0 ? (
          <Badge size="xs" variant="light" color="gray" circle>
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
