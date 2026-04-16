import {
  Group,
  TextInput,
  Button,
  Badge,
  Text,
  ActionIcon,
  useMantineColorScheme,
  Box,
} from "@mantine/core";
import {
  PlugsConnected,
  Plug,
  Sun,
  Moon,
  Terminal,
} from "@phosphor-icons/react";
import { useState } from "react";
import type { ConnectionState } from "../types";

interface ConnectionHeaderProps {
  connection: ConnectionState;
  onConnect: (url: string) => void;
  onDisconnect: () => void;
}

export function ConnectionHeader({
  connection,
  onConnect,
  onDisconnect,
}: ConnectionHeaderProps) {
  const [url, setUrl] = useState(connection.serverUrl);
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  const isConnected = connection.status === "connected";
  const isConnecting = connection.status === "connecting";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isConnected) {
      onDisconnect();
    } else {
      onConnect(url);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%" }}>
      <Group h="100%" px="md" justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <Box
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: 4,
              background: isConnected
                ? "rgba(76, 175, 80, 0.12)"
                : "rgba(255, 193, 7, 0.1)",
              border: `1px solid ${isConnected ? "rgba(76, 175, 80, 0.3)" : "rgba(255, 193, 7, 0.2)"}`,
              transition: "all 0.3s ease",
            }}
          >
            <Terminal
              size={16}
              weight="bold"
              color={isConnected ? "var(--oc-signal)" : "var(--oc-amber)"}
            />
          </Box>
          <Text
            fw={700}
            size="xs"
            visibleFrom="sm"
            ff="var(--mantine-font-family-monospace)"
            style={{
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--oc-text-secondary)",
            }}
          >
            opencode
          </Text>
        </Group>

        <Group gap="xs" wrap="nowrap" style={{ flex: 1, maxWidth: 500 }}>
          <TextInput
            size="xs"
            placeholder="http://localhost:4096"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            disabled={isConnected || isConnecting}
            style={{ flex: 1 }}
          />
          <Button
            size="xs"
            type="submit"
            loading={isConnecting}
            color={isConnected ? "red" : "amber"}
            leftSection={isConnected ? <Plug size={14} /> : <PlugsConnected size={14} />}
            variant={isConnected ? "light" : "filled"}
          >
            {isConnected ? "Disconnect" : "Connect"}
          </Button>
        </Group>

        <Group gap="xs" wrap="nowrap">
          {connection.status === "connected" && (
            <Badge
              color="green"
              variant="dot"
              size="sm"
              styles={{
                root: {
                  background: "rgba(76, 175, 80, 0.08)",
                  border: "1px solid rgba(76, 175, 80, 0.2)",
                },
              }}
            >
              v{connection.version}
            </Badge>
          )}
          {connection.status === "error" && (
            <Badge
              color="red"
              variant="dot"
              size="sm"
              styles={{
                root: {
                  background: "rgba(239, 83, 80, 0.08)",
                  border: "1px solid rgba(239, 83, 80, 0.2)",
                },
              }}
            >
              {connection.error}
            </Badge>
          )}
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={toggleColorScheme}
            aria-label="Toggle color scheme"
            style={{
              color: "var(--oc-text-muted)",
              transition: "color 0.2s ease",
            }}
          >
            {colorScheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </ActionIcon>
        </Group>
      </Group>
    </form>
  );
}
