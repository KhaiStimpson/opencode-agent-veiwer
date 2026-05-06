// ---------------------------------------------------------------------------
// Date range presets and helpers for the dashboard filter
// ---------------------------------------------------------------------------

export type DateRangePreset = "last30days" | "thisMonth" | "lastMonth" | "custom";

export interface DateRange {
  preset: DateRangePreset;
  /** Inclusive lower bound (start of day). null means no lower bound. */
  start: Date | null;
  /** Inclusive upper bound (end of day). null means no upper bound. */
  end: Date | null;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function getPresetRange(preset: Exclude<DateRangePreset, "custom">): DateRange {
  const now = new Date();

  if (preset === "last30days") {
    const start = startOfDay(new Date(now));
    start.setDate(start.getDate() - 29);
    return { preset, start, end: endOfDay(now) };
  }

  if (preset === "thisMonth") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { preset, start, end: endOfDay(now) };
  }

  // lastMonth
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(firstOfThisMonth.getFullYear(), firstOfThisMonth.getMonth() - 1, 1, 0, 0, 0, 0);
  const end = new Date(firstOfThisMonth.getTime() - 1); // last ms of previous month
  return { preset, start, end };
}

/** Return the default date range (last 30 days). */
export function defaultDateRange(): DateRange {
  return getPresetRange("last30days");
}

/** Return true if the timestamp (ms) falls within the range. */
export function isInDateRange(timestampMs: number, range: DateRange): boolean {
  if (range.start && timestampMs < range.start.getTime()) return false;
  if (range.end && timestampMs > range.end.getTime()) return false;
  return true;
}

/** Human-readable label for the current range. */
export function dateRangeLabel(range: DateRange): string {
  if (range.preset === "last30days") return "Last 30 days";
  if (range.preset === "thisMonth") return "This month";
  if (range.preset === "lastMonth") return "Last month";
  if (range.start && range.end) {
    return `${range.start.toLocaleDateString()} – ${range.end.toLocaleDateString()}`;
  }
  return "Custom";
}
