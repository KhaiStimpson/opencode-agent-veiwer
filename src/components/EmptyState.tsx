import { Stack, Text, Center } from "@mantine/core";
import { MonitorPlay } from "@phosphor-icons/react";

interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <Center h="100%" p="xl">
      <Stack align="center" gap="sm">
        <MonitorPlay size={48} weight="thin" opacity={0.4} />
        <Text size="lg" fw={500} c="dimmed">
          {title}
        </Text>
        {description && (
          <Text size="sm" c="dimmed" ta="center" maw={300}>
            {description}
          </Text>
        )}
      </Stack>
    </Center>
  );
}
