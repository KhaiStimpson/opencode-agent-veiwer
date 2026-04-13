import {
  Group,
  TextInput,
  Button,
  Badge,
  Text,
  ActionIcon,
  useMantineColorScheme,
} from "@mantine/core";
import {
  PlugsConnected,
  Plug,
  Sun,
  Moon,
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
        <Group gap="xs" wrap="nowrap">
          <PlugsConnected size={20} weight="bold" />
          <Text fw={700} size="sm" visibleFrom="sm">
            OpenCode Viewer
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
            styles={{
              input: { fontFamily: "var(--mantine-font-family-monospace)" },
            }}
          />
          <Button
            size="xs"
            type="submit"
            loading={isConnecting}
            color={isConnected ? "red" : "blue"}
            leftSection={isConnected ? <Plug size={14} /> : <PlugsConnected size={14} />}
            variant={isConnected ? "light" : "filled"}
          >
            {isConnected ? "Disconnect" : "Connect"}
          </Button>
        </Group>

        <Group gap="xs" wrap="nowrap">
          {connection.status === "connected" && (
            <Badge color="green" variant="dot" size="sm">
              v{connection.version}
            </Badge>
          )}
          {connection.status === "error" && (
            <Badge color="red" variant="dot" size="sm">
              {connection.error}
            </Badge>
          )}
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={toggleColorScheme}
            aria-label="Toggle color scheme"
          >
            {colorScheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </ActionIcon>
        </Group>
      </Group>
    </form>
  );
}
