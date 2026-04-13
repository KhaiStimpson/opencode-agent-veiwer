import {
  AppShell,
  TextInput,
  ScrollArea,
  Text,
  Stack,
  Skeleton,
} from "@mantine/core";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useState, useMemo } from "react";
import { SessionNavItem } from "./SessionNavItem";
import type { SessionNode } from "../types";

interface SessionNavProps {
  tree: SessionNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}

function flatContains(node: SessionNode, query: string): boolean {
  const q = query.toLowerCase();
  if (
    (node.session.title || "").toLowerCase().includes(q) ||
    node.session.id.toLowerCase().includes(q)
  ) {
    return true;
  }
  return node.children.some((c) => flatContains(c, q));
}

export function SessionNav({
  tree,
  selectedId,
  onSelect,
  loading,
}: SessionNavProps) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!filter.trim()) return tree;
    return tree.filter((node) => flatContains(node, filter));
  }, [tree, filter]);

  return (
    <>
      <AppShell.Section p="xs">
        <TextInput
          size="xs"
          placeholder="Filter sessions..."
          leftSection={<MagnifyingGlass size={14} />}
          value={filter}
          onChange={(e) => setFilter(e.currentTarget.value)}
        />
      </AppShell.Section>

      <AppShell.Section grow component={ScrollArea} p="xs">
        {loading ? (
          <Stack gap="xs">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height={40} radius="sm" />
            ))}
          </Stack>
        ) : filtered.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="md">
            {tree.length === 0 ? "No sessions" : "No matches"}
          </Text>
        ) : (
          filtered.map((node) => (
            <SessionNavItem
              key={node.session.id}
              node={node}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))
        )}
      </AppShell.Section>

      <AppShell.Section p="xs">
        <Text size="xs" c="dimmed" ta="center">
          {tree.length} session{tree.length !== 1 ? "s" : ""}
        </Text>
      </AppShell.Section>
    </>
  );
}
