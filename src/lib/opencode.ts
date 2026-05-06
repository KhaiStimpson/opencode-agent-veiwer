import { createOpencodeClient } from "@opencode-ai/sdk";
import type { Session } from "../types";

export type OpencodeClient = ReturnType<typeof createOpencodeClient>;

// Matches the server's default page size; used to detect when more pages exist.
const SESSION_PAGE_SIZE = 100;

/**
 * Fetches all sessions by paginating through server pages.
 * The OpenCode server defaults to 100 sessions per request; this helper
 * transparently pages through using the `start` offset until all are retrieved.
 * A de-duplication guard prevents infinite loops on servers that ignore `start`.
 */
export async function fetchAllSessions(client: OpencodeClient): Promise<Session[]> {
  const all: Session[] = [];
  const seenIds = new Set<string>();
  let start = 0;

  while (true) {
    // The v1 SDK types only expose `directory` as a query param, but the
    // underlying server also accepts `start` and `limit` for pagination.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (client.session.list as any)({ query: { limit: SESSION_PAGE_SIZE, start } });
    const page = (res.data ?? []) as Session[];

    let added = 0;
    for (const session of page) {
      if (!seenIds.has(session.id)) {
        seenIds.add(session.id);
        all.push(session);
        added++;
      }
    }

    // Stop if this was the last page, or if the server doesn't support `start`
    // (it returned only already-seen sessions, meaning no real pagination).
    if (page.length < SESSION_PAGE_SIZE || added === 0) break;
    start += SESSION_PAGE_SIZE;
  }

  return all;
}

export function createClient(baseUrl: string): OpencodeClient {
  return createOpencodeClient({ baseUrl });
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 0) return "just now";

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatCost(cost: number): string {
  if (cost === 0) return "$0.00";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(count: number): string {
  if (count === 0) return "0";
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}
