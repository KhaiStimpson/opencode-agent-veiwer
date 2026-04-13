import { Badge, Loader } from "@mantine/core";
import { memo } from "react";
import type { SessionStatus } from "../types";

interface StatusBadgeProps {
  status: SessionStatus;
  size?: "xs" | "sm" | "md" | "lg";
}

function StatusBadgeInner({ status, size = "sm" }: StatusBadgeProps) {
  switch (status.type) {
    case "busy":
      return (
        <Badge
          size={size}
          color="blue"
          variant="dot"
          leftSection={<Loader size={8} color="blue" />}
        >
          busy
        </Badge>
      );
    case "retry":
      return (
        <Badge size={size} color="yellow" variant="dot">
          retry #{status.attempt}
        </Badge>
      );
    case "idle":
    default:
      return (
        <Badge size={size} color="gray" variant="dot">
          idle
        </Badge>
      );
  }
}

export const StatusBadge = memo(StatusBadgeInner);
