import { Badge, Loader, Box } from "@mantine/core";
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
          color="amber"
          variant="light"
          leftSection={<Loader size={8} color="var(--oc-amber)" />}
          styles={{
            root: {
              background: "rgba(255, 193, 7, 0.1)",
              border: "1px solid rgba(255, 193, 7, 0.2)",
              color: "var(--oc-amber)",
            },
          }}
        >
          busy
        </Badge>
      );
    case "retry":
      return (
        <Badge
          size={size}
          color="yellow"
          variant="light"
          styles={{
            root: {
              background: "rgba(255, 193, 7, 0.06)",
              border: "1px solid rgba(255, 193, 7, 0.15)",
            },
          }}
        >
          retry #{status.attempt}
        </Badge>
      );
    case "idle":
    default:
      return (
        <Box
          component="span"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: 10,
            fontFamily: "var(--mantine-font-family-monospace)",
            fontWeight: 600,
            letterSpacing: "0.04em",
            color: "var(--oc-text-muted)",
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid var(--oc-border-subtle)",
          }}
        >
          <Box
            component="span"
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "var(--oc-text-muted)",
              opacity: 0.5,
            }}
          />
          idle
        </Box>
      );
  }
}

export const StatusBadge = memo(StatusBadgeInner);
