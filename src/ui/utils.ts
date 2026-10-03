import type { BenchmarkReport, SiteRule, TabInfo } from "../shared/types";

export type UsageSort = "recent" | "title" | "mostToday" | "leastToday" | "mostWeek" | "leastWeek";

export function formatIdle(minutes: number): string {
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${Math.floor(minutes)}m idle`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h idle`;
  return `${Math.floor(minutes / 1440)}d idle`;
}

export function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

export function describeRule(rule: SiteRule | undefined): string {
  if (!rule) return "Follow default";
  if (rule.mode === "awake") return "Keep awake";
  if (rule.mode === "manual") return "Manual only";
  return `After ${rule.minutes} min`;
}

export function describePolicy(tab: TabInfo): string {
  if (tab.policyMode === "awake") return "Keep awake";
  if (tab.policyMode === "manual") return "Manual only";
  return `${tab.timerMinutes ?? 15} min timer`;
}

export function sortedTabs(tabs: TabInfo[], sort: UsageSort): TabInfo[] {
  const result = [...tabs];
  const byTitle = (a: TabInfo, b: TabInfo) => (a.title || a.hostname).localeCompare(b.title || b.hostname);
  switch (sort) {
    case "title": return result.sort(byTitle);
    case "mostToday": return result.sort((a, b) => b.usageTodayMs - a.usageTodayMs || byTitle(a, b));
    case "leastToday": return result.sort((a, b) => a.usageTodayMs - b.usageTodayMs || byTitle(a, b));
    case "mostWeek": return result.sort((a, b) => b.usageWeekMs - a.usageWeekMs || byTitle(a, b));
    case "leastWeek": return result.sort((a, b) => a.usageWeekMs - b.usageWeekMs || byTitle(a, b));
    default: return result.sort((a, b) => b.lastActiveAt - a.lastActiveAt || byTitle(a, b));
  }
}

export function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function deltaLabel(kib: number): string {
  const mib = Math.abs(kib) / 1024;
  return `${kib >= 0 ? "+" : "−"}${mib.toFixed(1)} MiB`;
}

export function parseBenchmarkReport(value: unknown): BenchmarkReport {
  if (!value || typeof value !== "object") throw new Error("This is not a benchmark report.");
  const report = value as Partial<BenchmarkReport>;
  if (report.schema !== 1 || typeof report.browser !== "string" || !report.browser.trim() ||
      typeof report.platform !== "string" || !report.platform.trim() ||
      typeof report.generatedAt !== "string" || !Number.isFinite(Date.parse(report.generatedAt)) ||
      !Array.isArray(report.series) || report.series.length === 0 || report.series.length > 100) {
    throw new Error("The report is missing its browser, date, or measured series.");
  }
  const conditions = new Set(["idle", "dashboard", "automatic", "unloaded"]);
  for (const series of report.series) {
    if (!series || !Number.isInteger(series.tabs) || series.tabs < 1 || series.tabs > 10000 ||
        !conditions.has(series.condition) ||
        !Number.isFinite(series.baselineMedianPssKiB) || series.baselineMedianPssKiB < 0 ||
        !Number.isFinite(series.extensionMedianPssKiB) || series.extensionMedianPssKiB < 0 ||
        !Number.isFinite(series.deltaMedianPssKiB) ||
        !Number.isInteger(series.runs) || series.runs < 1 || series.runs > 1000 ||
        (series.cpuPercent !== undefined && (!Number.isFinite(series.cpuPercent) || series.cpuPercent < 0))) {
      throw new Error("A measurement has an invalid condition or value.");
    }
  }
  return report as BenchmarkReport;
}
