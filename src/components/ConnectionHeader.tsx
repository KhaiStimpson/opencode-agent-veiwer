import {
  Group,
  Select,
  Button,
  Badge,
  Text,
  ActionIcon,
  useMantineColorScheme,
  Box,
  Popover,
  TextInput,
} from "@mantine/core";
import {
  PlugsConnected,
  Plug,
  Sun,
  Moon,
  Terminal,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useOpencode } from "../hooks/useOpencode";

function statusDotColor(status: string): string {
  switch (status) {
    case "connected":
      return "var(--mantine-color-green-6)";
    case "connecting":
      return "var(--mantine-color-yellow-6)";
    case "error":
      return "var(--mantine-color-red-6)";
    default:
      return "var(--mantine-color-gray-5)";
  }
}

export function ConnectionHeader() {
  const {
    servers,
    activeServerId,
    activeConnection,
    setActiveServer,
    connectServer,
    disconnectServer,
    addServer,
    removeServer,
  } = useOpencode();

  const [addUrl, setAddUrl] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  const isConnected = activeConnection?.status === "connected";
  const isConnecting = activeConnection?.status === "connecting";

  const selectData = servers.map((s) => ({
    value: s.id,
    label: s.label,
  }));

  const handleAddServer = () => {
    const trimmed = addUrl.trim();
    if (!trimmed) return;
    const id = addServer(trimmed);
    setActiveServer(id);
    // Pass the URL directly so connectServer can use it before state updates apply
    connectServer(id, trimmed);
    setAddUrl("");
    setAddOpen(false);
  };

  const handleToggleConnect = () => {
    if (!activeServerId) return;
    if (isConnected) {
      disconnectServer(activeServerId);
    } else {
      connectServer(activeServerId);
    }
  };

  return (
    <Group h="100%" px="md" justify="space-between" wrap="nowrap">
      {/* Logo */}
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

      {/* Server selector + connect controls */}
      <Group gap="xs" wrap="nowrap" style={{ flex: 1, maxWidth: 580 }}>
        <Select
          size="xs"
          data={selectData}
          value={activeServerId}
          onChange={(id) => id && setActiveServer(id)}
          disabled={isConnecting}
          allowDeselect={false}
          leftSection={
            activeConnection ? (
              <Box
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: statusDotColor(activeConnection.status),
                }}
              />
            ) : undefined
          }
          renderOption={({ option }) => {
            const server = servers.find((s) => s.id === option.value);
            const status = server?.connection.status ?? "disconnected";
            return (
              <Group gap="xs" wrap="nowrap">
                <Box
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: statusDotColor(status),
                    flexShrink: 0,
                  }}
                />
                <Text
                  size="xs"
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {option.label}
                </Text>
              </Group>
            );
          }}
          style={{ flex: 1 }}
        />

        <Button
          size="xs"
          loading={isConnecting}
          onClick={handleToggleConnect}
          color={isConnected ? "red" : "amber"}
          leftSection={
            isConnected ? <Plug size={14} /> : <PlugsConnected size={14} />
          }
          variant={isConnected ? "light" : "filled"}
          disabled={!activeServerId}
        >
          {isConnected ? "Disconnect" : "Connect"}
        </Button>

        {/* Add server */}
        <Popover
          opened={addOpen}
          onChange={setAddOpen}
          position="bottom-start"
        >
          <Popover.Target>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={() => setAddOpen((o) => !o)}
              aria-label="Add server"
              style={{ color: "var(--oc-text-muted)" }}
            >
              <Plus size={14} />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown>
            <Group gap="xs" wrap="nowrap">
              <TextInput
                size="xs"
                placeholder="http://localhost:4097"
                value={addUrl}
                onChange={(e) => setAddUrl(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddServer()}
                style={{ width: 220 }}
                autoFocus
              />
              <Button size="xs" onClick={handleAddServer}>
                Add
              </Button>
            </Group>
          </Popover.Dropdown>
        </Popover>

        {/* Remove active server (only when more than one exists) */}
        {servers.length > 1 && activeServerId && (
          <ActionIcon
            variant="subtle"
            size="sm"
            color="red"
            onClick={() => removeServer(activeServerId)}
            aria-label="Remove server"
          >
            <Trash size={14} />
          </ActionIcon>
        )}
      </Group>

      {/* Right: badges + dark mode toggle */}
      <Group gap="xs" wrap="nowrap">
        {activeConnection?.status === "connected" && (
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
            v{activeConnection.version}
          </Badge>
        )}
        {activeConnection?.status === "error" && (
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
            {activeConnection.error}
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
  );
}
