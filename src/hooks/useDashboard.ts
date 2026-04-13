import { useState, useEffect, useCallback, useRef } from "react";
import type { OpencodeClient } from "../lib/opencode";
import type { Session, Message, Part } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MessageWithParts {
  info: Message;
  parts: Part[];
}

interface TokenTotals {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

interface ModelStats {
  modelID: string;
  displayName: string;
  providerID: string;
  premiumRequests: number;
  tokens: TokenTotals;
  cost: number;
  avgResponseMs: number;
  messageCount: number;
}

interface ToolStats {
  tool: string;
  calls: number;
  successes: number;
  errors: number;
  avgDurationMs: number;
}

interface DailyActivity {
  date: string;
  sessions: number;
  premiumRequests: number;
  cost: number;
  tokens: number;
}

export interface DashboardStats {
  // Overview
  totalSessions: number;
  rootSessions: number;
  subagentSessions: number;
  activeSessions: number;
  totalPremiumRequests: number;
  totalCost: number;
  totalTokens: TokenTotals;
  totalMessages: number;

  // Per-model breakdown
  modelStats: ModelStats[];

  // Tool usage
  toolStats: ToolStats[];

  // Daily activity
  dailyActivity: DailyActivity[];

  // Performance
  avgResponseMs: number;
  avgTokensPerRequest: number;
  errorCount: number;
  errorRate: number;
  compactionCount: number;
  compactionAuto: number;

  // Code impact
  totalAdditions: number;
  totalDeletions: number;
  totalFilesChanged: number;
}

export interface UseDashboardResult {
  stats: DashboardStats | null;
  loading: boolean;
  progress: { done: number; total: number };
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDisplayName(modelID: string): string {
  const raw = modelID.trim();
  return raw.includes("/") ? raw.split("/").pop()! : raw;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function aggregateStats(
  sessions: Session[],
  allMessages: Map<string, MessageWithParts[]>,
  activeSessions: number,
): DashboardStats {
  const rootSessions = sessions.filter((s) => !s.parentID);
  const subagentSessions = sessions.filter((s) => !!s.parentID);
  const subagentIDs = new Set(subagentSessions.map((s) => s.id));

  const totalTokens: TokenTotals = {
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
  };
  let totalCost = 0;
  let totalMessages = 0;
  let totalPremiumRequests = 0;
  let totalResponseMs = 0;
  let responseCount = 0;
  let errorCount = 0;
  let compactionCount = 0;
  let compactionAuto = 0;

  // Accumulators
  const modelMap = new Map<
    string,
    {
      modelID: string;
      displayName: string;
      providerID: string;
      premiumRequests: number;
      tokens: TokenTotals;
      cost: number;
      totalResponseMs: number;
      responseCount: number;
      messageCount: number;
    }
  >();

  const toolMap = new Map<
    string,
    {
      calls: number;
      successes: number;
      errors: number;
      totalDurationMs: number;
      durationCount: number;
    }
  >();

  const dailyMap = new Map<
    string,
    {
      sessions: number;
      premiumRequests: number;
      cost: number;
      tokens: number;
    }
  >();

  // Count sessions per day
  for (const s of sessions) {
    const day = new Date(s.time.created).toISOString().slice(0, 10);
    const entry = dailyMap.get(day) || {
      sessions: 0,
      premiumRequests: 0,
      cost: 0,
      tokens: 0,
    };
    entry.sessions++;
    dailyMap.set(day, entry);
  }

  // Aggregate messages
  for (const [sessionId, messages] of allMessages) {
    const isSubagent = subagentIDs.has(sessionId);

    for (const { info, parts } of messages) {
      totalMessages++;

      if (info.role === "user" && !isSubagent) {
        totalPremiumRequests++;
        const modelID = info.model.modelID;
        const providerID = info.model.providerID;
        const key = `${providerID}/${modelID}`;

        if (!modelMap.has(key)) {
          modelMap.set(key, {
            modelID,
            displayName: getDisplayName(modelID),
            providerID,
            premiumRequests: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
            cost: 0,
            totalResponseMs: 0,
            responseCount: 0,
            messageCount: 0,
          });
        }
        modelMap.get(key)!.premiumRequests++;

        // Daily premium request count
        const day = new Date(info.time.created).toISOString().slice(0, 10);
        const dayEntry = dailyMap.get(day) || {
          sessions: 0,
          premiumRequests: 0,
          cost: 0,
          tokens: 0,
        };
        dayEntry.premiumRequests++;
        dailyMap.set(day, dayEntry);
      }

      if (info.role === "assistant") {
        totalTokens.input += info.tokens.input;
        totalTokens.output += info.tokens.output;
        totalTokens.reasoning += info.tokens.reasoning;
        totalTokens.cacheRead += info.tokens.cache.read;
        totalTokens.cacheWrite += info.tokens.cache.write;
        totalCost += info.cost;

        const modelID = info.modelID;
        const providerID = info.providerID;
        const key = `${providerID}/${modelID}`;

        if (!modelMap.has(key)) {
          modelMap.set(key, {
            modelID,
            displayName: getDisplayName(modelID),
            providerID,
            premiumRequests: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
            cost: 0,
            totalResponseMs: 0,
            responseCount: 0,
            messageCount: 0,
          });
        }
        const ms = modelMap.get(key)!;
        ms.tokens.input += info.tokens.input;
        ms.tokens.output += info.tokens.output;
        ms.tokens.reasoning += info.tokens.reasoning;
        ms.tokens.cacheRead += info.tokens.cache.read;
        ms.tokens.cacheWrite += info.tokens.cache.write;
        ms.cost += info.cost;
        ms.messageCount++;

        // Response time
        if (info.time.completed) {
          const rt = info.time.completed - info.time.created;
          if (rt > 0 && rt < 600_000) {
            totalResponseMs += rt;
            responseCount++;
            ms.totalResponseMs += rt;
            ms.responseCount++;
          }
        }

        if (info.error) {
          errorCount++;
        }

        // Daily cost/tokens
        const day = new Date(info.time.created).toISOString().slice(0, 10);
        const dayEntry = dailyMap.get(day) || {
          sessions: 0,
          premiumRequests: 0,
          cost: 0,
          tokens: 0,
        };
        dayEntry.cost += info.cost;
        dayEntry.tokens += info.tokens.input + info.tokens.output;
        dailyMap.set(day, dayEntry);
      }

      // Tool parts
      for (const part of parts) {
        if (part.type === "tool") {
          const toolName = part.tool;
          if (!toolMap.has(toolName)) {
            toolMap.set(toolName, {
              calls: 0,
              successes: 0,
              errors: 0,
              totalDurationMs: 0,
              durationCount: 0,
            });
          }
          const ts = toolMap.get(toolName)!;
          ts.calls++;

          if (part.state.status === "completed") {
            ts.successes++;
            const dur = part.state.time.end - part.state.time.start;
            if (dur > 0 && dur < 600_000) {
              ts.totalDurationMs += dur;
              ts.durationCount++;
            }
          } else if (part.state.status === "error") {
            ts.errors++;
          }
        }

        if (part.type === "compaction") {
          compactionCount++;
          if (part.auto) compactionAuto++;
        }
      }
    }
  }

  // Code impact
  let totalAdditions = 0;
  let totalDeletions = 0;
  let totalFilesChanged = 0;
  for (const s of sessions) {
    if (s.summary) {
      totalAdditions += s.summary.additions;
      totalDeletions += s.summary.deletions;
      totalFilesChanged += s.summary.files;
    }
  }

  // Build model stats
  const modelStats: ModelStats[] = Array.from(modelMap.values()).map(
    (m) => ({
      modelID: m.modelID,
      displayName: m.displayName,
      providerID: m.providerID,
      premiumRequests: m.premiumRequests,
      tokens: m.tokens,
      cost: m.cost,
      avgResponseMs:
        m.responseCount > 0 ? m.totalResponseMs / m.responseCount : 0,
      messageCount: m.messageCount,
    })
  );
  modelStats.sort((a, b) => b.cost - a.cost);

  // Build tool stats
  const toolStats: ToolStats[] = Array.from(toolMap.entries()).map(
    ([tool, t]) => ({
      tool,
      calls: t.calls,
      successes: t.successes,
      errors: t.errors,
      avgDurationMs:
        t.durationCount > 0 ? t.totalDurationMs / t.durationCount : 0,
    })
  );
  toolStats.sort((a, b) => b.calls - a.calls);

  // Build daily activity
  const dailyActivity: DailyActivity[] = Array.from(dailyMap.entries())
    .map(([date, d]) => ({
      date,
      sessions: d.sessions,
      premiumRequests: d.premiumRequests,
      cost: d.cost,
      tokens: d.tokens,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalTokenCount = totalTokens.input + totalTokens.output;

  return {
    totalSessions: sessions.length,
    rootSessions: rootSessions.length,
    subagentSessions: subagentSessions.length,
    activeSessions,
    totalPremiumRequests,
    totalCost,
    totalTokens,
    totalMessages,
    modelStats,
    toolStats,
    dailyActivity,
    avgResponseMs: responseCount > 0 ? totalResponseMs / responseCount : 0,
    avgTokensPerRequest:
      totalPremiumRequests > 0
        ? totalTokenCount / totalPremiumRequests
        : 0,
    errorCount,
    errorRate:
      totalMessages > 0 ? errorCount / totalMessages : 0,
    compactionCount,
    compactionAuto,
    totalAdditions,
    totalDeletions,
    totalFilesChanged,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const BATCH_SIZE = 5;

export function useDashboard(
  client: OpencodeClient | null,
  sessions: Session[],
  activeSessions: number,
): UseDashboardResult {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const cacheRef = useRef(new Map<string, MessageWithParts[]>());
  const fetchingRef = useRef(false);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  // Auto-fetch when sessions change or trigger increments
  useEffect(() => {
    if (!client || sessions.length === 0) return;
    if (fetchingRef.current) return;

    let cancelled = false;
    fetchingRef.current = true;

    async function run() {
      setLoading(true);
      const total = sessions.length;
      setProgress({ done: 0, total });
      const cache = cacheRef.current;

      let done = 0;
      for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
        if (cancelled) break;
        const batch = sessions.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (s) => {
            const cached = cache.get(s.id);
            if (cached) return;

            try {
              const res = await client!.session.messages({
                path: { id: s.id },
              });
              const messages = (res.data ?? []) as MessageWithParts[];
              cache.set(s.id, messages);
            } catch {
              cache.set(s.id, []);
            }
          })
        );

        done += batch.length;
        if (!cancelled) {
          setProgress({ done: Math.min(done, total), total });
        }
      }

      if (cancelled) return;

      const allMessages = new Map<string, MessageWithParts[]>();
      for (const s of sessions) {
        allMessages.set(s.id, cache.get(s.id) || []);
      }

      const result = aggregateStats(sessions, allMessages, activeSessions);
      setStats(result);
      setLoading(false);
      fetchingRef.current = false;
    }

    run();

    return () => {
      cancelled = true;
      fetchingRef.current = false;
    };
  }, [client, sessions, activeSessions, fetchTrigger]);

  const refresh = useCallback(() => {
    cacheRef.current.clear();
    setFetchTrigger((c) => c + 1);
  }, []);

  return { stats, loading, progress, refresh };
}
