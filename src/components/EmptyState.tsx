import { Stack, Text, Center, Box } from "@mantine/core";
import { Terminal } from "@phosphor-icons/react";

interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <Center h="100%" p="xl">
      <Stack align="center" gap="md" className="oc-fade-in">
        <Box
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 72,
            height: 72,
            borderRadius: 8,
            background: "rgba(255, 193, 7, 0.04)",
            border: "1px solid rgba(255, 193, 7, 0.1)",
          }}
        >
          <Terminal size={32} weight="thin" color="var(--oc-amber)" style={{ opacity: 0.6 }} />
          {/* Cursor blink */}
          <Box
            style={{
              position: "absolute",
              bottom: 18,
              right: 22,
              width: 2,
              height: 14,
              background: "var(--oc-amber)",
              animation: "terminal-cursor 1s step-end infinite",
            }}
          />
        </Box>
        <Text
          size="sm"
          fw={600}
          ff="var(--mantine-font-family-monospace)"
          style={{
            color: "var(--oc-text-secondary)",
            letterSpacing: "0.02em",
          }}
        >
          {title}
        </Text>
        {description && (
          <Text
            size="xs"
            ta="center"
            maw={340}
            ff="var(--mantine-font-family-monospace)"
            style={{
              color: "var(--oc-text-muted)",
              lineHeight: 1.6,
            }}
          >
            {description}
          </Text>
        )}
      </Stack>
    </Center>
  );
}
