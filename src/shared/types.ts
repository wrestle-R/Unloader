export type Theme = "system" | "light" | "dark";

export type SiteRule =
  | { mode: "manual" }
  | { mode: "awake" }
  | { mode: "timed"; minutes: number };

export interface Settings {
  globalIdleMinutes: number | null;
  siteRules: Record<string, SiteRule>;
  theme: Theme;
}

export interface SafetySignals {
  editing: boolean;
  media: boolean;
}

export interface TabInfo {
  id: number;
  windowId: number;
  url: string;
  title: string;
  hostname: string;
  favIconUrl?: string;
  active: boolean;
  pinned: boolean;
  audible: boolean;
  discarded: boolean;
  lastActiveAt: number;
  idleMinutes: number;
  policyMode: "manual" | "awake" | "timed";
  timerMinutes: number | null;
  safety: SafetySignals;
  usageTodayMs: number;
  usageWeekMs: number;
}

export interface ActivityEntry {
  id: string;
  at: number;
  hostname: string;
  action: "unload" | "restore" | "blocked";
  reason: string;
}

export interface BackgroundStats {
  scanCount: number;
  lastScanAt: number | null;
  lastScanDurationMs: number | null;
  trackedTabs: number;
  storageBytes: number;
}

export interface DashboardSnapshot {
  settings: Settings;
  tabs: TabInfo[];
  activity: ActivityEntry[];
  stats: BackgroundStats;
  shortcut: string | null;
}

export interface UnloadResult {
  status: "done" | "needs_confirmation" | "blocked";
  message?: string;
  tabId: number;
}

export interface ExportedSettings {
  schema: 1;
  settings: Settings;
}

export interface BenchmarkSeries {
  tabs: number;
  condition: "idle" | "dashboard" | "automatic" | "unloaded";
  baselineMedianPssKiB: number;
  extensionMedianPssKiB: number;
  deltaMedianPssKiB: number;
  runs: number;
  cpuPercent?: number;
}

export interface BenchmarkReport {
  schema: 1;
  generatedAt: string;
  browser: string;
  platform: string;
  series: BenchmarkSeries[];
}

export type RequestMessage =
  | { type: "getSnapshot" }
  | { type: "setGlobalMinutes"; minutes: number | null }
  | { type: "setTheme"; theme: Theme }
  | { type: "setRule"; hostname: string; rule: SiteRule | null }
  | { type: "unloadTab"; tabId: number; force?: boolean }
  | { type: "restoreTab"; tabId: number }
  | { type: "clearActivity" }
  | { type: "exportSettings" }
  | { type: "importSettings"; value: unknown }
  | { type: "safetyUpdate"; safety: SafetySignals };

export type ResponseMessage<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
