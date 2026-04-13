import { Paper, Stack, Text, Group, ThemeIcon } from "@mantine/core";
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
    <Paper p="md" withBorder radius="md" style={{ flex: 1, minWidth: 160 }}>
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={2}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {label}
          </Text>
          <Text size="xl" fw={700}>
            {value}
          </Text>
          {subtitle && (
            <Text size="xs" c="dimmed">
              {subtitle}
            </Text>
          )}
        </Stack>
        <ThemeIcon size="lg" variant="light" color={color} radius="md">
          {icon}
        </ThemeIcon>
      </Group>
    </Paper>
  );
}

export const StatCard = memo(StatCardInner);
