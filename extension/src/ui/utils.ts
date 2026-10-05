import type { SiteRule, TabInfo } from "../shared/types";

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
  if (!/^https?:\/\//i.test(tab.url)) return "Browser page · excluded";
  if (tab.policyMode === "awake") return "Keep awake";
  if (tab.pinned) return "Pinned · protected";
  if (tab.active) return "Active · protected";
  if (tab.audible || tab.safety.media) return "Media · protected";
  if (tab.safety.editing) return "Editing · protected";
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
