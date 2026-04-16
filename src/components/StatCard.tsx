import { Paper, Stack, Text, Group, Box } from "@mantine/core";
import { memo, type ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  color: string;
}

function StatCardInner({ label, value, subtitle, icon, color }: StatCardProps) {
  return (
    <Paper
      p="md"
      withBorder
      radius="sm"
      style={{
        flex: 1,
        minWidth: 160,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Top accent line */}
      <Box
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `var(--mantine-color-${color}-6, var(--oc-amber))`,
          opacity: 0.6,
        }}
      />
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={2}>
          <Text
            size="xs"
            tt="uppercase"
            fw={600}
            ff="var(--mantine-font-family-monospace)"
            style={{
              color: "var(--oc-text-muted)",
              letterSpacing: "0.06em",
              fontSize: 10,
            }}
          >
            {label}
          </Text>
          <Text
            size="xl"
            fw={700}
            ff="var(--mantine-font-family-monospace)"
            style={{ color: "var(--oc-text-primary)" }}
          >
            {value}
          </Text>
          {subtitle && (
            <Text
              size="xs"
              ff="var(--mantine-font-family-monospace)"
              style={{ color: "var(--oc-text-muted)", fontSize: 10 }}
            >
              {subtitle}
            </Text>
          )}
        </Stack>
        <Box
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: 6,
            background: `color-mix(in srgb, var(--mantine-color-${color}-6, var(--oc-amber)) 10%, transparent)`,
            border: `1px solid color-mix(in srgb, var(--mantine-color-${color}-6, var(--oc-amber)) 20%, transparent)`,
            color: `var(--mantine-color-${color}-6, var(--oc-amber))`,
          }}
        >
          {icon}
        </Box>
      </Group>
    </Paper>
  );
}

export const StatCard = memo(StatCardInner);
