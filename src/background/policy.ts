import type { SafetySignals, Settings, SiteRule, Theme } from "../shared/types";

export const DEFAULT_SETTINGS: Settings = {
  globalIdleMinutes: 15,
  siteRules: {},
  theme: "system",
};

export interface ResolvedPolicy {
  mode: "manual" | "awake" | "timed";
  minutes: number | null;
}

export interface AutoUnloadCandidate {
  url: string;
  active: boolean;
  pinned: boolean;
  audible: boolean;
  discarded: boolean;
  loading: boolean;
  lastActiveAt: number;
  safety: SafetySignals | null;
}

export interface ReplacementCandidate {
  id: number;
  discarded: boolean;
  lastActiveAt: number;
  index: number;
}

export function isWebUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const protocol = new URL(url).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

export function hostnameFromUrl(url: string | undefined): string {
  if (!isWebUrl(url)) return "";
  try {
    return new URL(url!).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

/** Returns an exact hostname, never a wildcard, URL, port, or path. */
export function normalizeHostname(input: string): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim().toLowerCase().replace(/\.$/, "");
  if (!value || value.length > 253 || /[\s/?#@*:]/.test(value)) return null;
  if (!/^[a-z0-9.-]+$/.test(value)) return null;
  if (value.split(".").some((label) => !label || label.length > 63 || /^-|-$/.test(label))) {
    return null;
  }
  return value;
}

export function validMinutes(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 1440;
}

export function parseSiteRule(value: unknown): SiteRule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rule = value as Record<string, unknown>;
  if (rule.mode === "manual" || rule.mode === "awake") {
    return Object.keys(rule).length === 1 ? { mode: rule.mode } : null;
  }
  if (rule.mode === "timed" && validMinutes(rule.minutes) && Object.keys(rule).length === 2) {
    return { mode: "timed", minutes: rule.minutes as number };
  }
  return null;
}

/** Strict parsing prevents invalid imports or stale data from changing tab policy. */
export function parseSettings(value: unknown): Settings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort().join(",");
  if (keys !== "globalIdleMinutes,siteRules,theme") return null;
  if (object.globalIdleMinutes !== null && !validMinutes(object.globalIdleMinutes)) return null;
  if (!["system", "light", "dark"].includes(String(object.theme))) return null;
  if (!object.siteRules || typeof object.siteRules !== "object" || Array.isArray(object.siteRules)) return null;

  const rules: Record<string, SiteRule> = {};
  const entries = Object.entries(object.siteRules as Record<string, unknown>);
  if (entries.length > 2000) return null;
  for (const [host, candidate] of entries) {
    const normalized = normalizeHostname(host);
    const rule = parseSiteRule(candidate);
    if (normalized !== host || !rule) return null;
    rules[host] = rule;
  }
  return {
    globalIdleMinutes: object.globalIdleMinutes as number | null,
    siteRules: rules,
    theme: object.theme as Theme,
  };
}

export function resolvePolicy(hostname: string, settings: Settings): ResolvedPolicy {
  const rule = settings.siteRules[hostname];
  if (rule?.mode === "awake") return { mode: "awake", minutes: null };
  if (rule?.mode === "manual") return { mode: "manual", minutes: null };
  if (rule?.mode === "timed") return { mode: "timed", minutes: rule.minutes };
  if (settings.globalIdleMinutes !== null) {
    return { mode: "timed", minutes: settings.globalIdleMinutes };
  }
  return { mode: "manual", minutes: null };
}

export function autoUnloadDueAt(candidate: AutoUnloadCandidate, settings: Settings): number | null {
  const hostname = hostnameFromUrl(candidate.url);
  if (!hostname || candidate.active || candidate.pinned || candidate.audible || candidate.discarded) return null;
  if (candidate.loading || !candidate.safety || candidate.safety.editing || candidate.safety.media) return null;
  const policy = resolvePolicy(hostname, settings);
  return policy.mode === "timed" && policy.minutes !== null
    ? candidate.lastActiveAt + policy.minutes * 60_000
    : null;
}

export function shouldAutoUnload(candidate: AutoUnloadCandidate, settings: Settings, now: number): boolean {
  const dueAt = autoUnloadDueAt(candidate, settings);
  return dueAt !== null && dueAt <= now;
}

export function chooseReplacementTab(
  targetId: number,
  candidates: readonly ReplacementCandidate[],
): number | null {
  const loaded = candidates.filter((candidate) => candidate.id !== targetId && !candidate.discarded);
  loaded.sort((a, b) => b.lastActiveAt - a.lastActiveAt || a.index - b.index);
  return loaded[0]?.id ?? null;
}

/** URL query strings and fragments never enter the usage store. */
export function usageKey(url: string | undefined): string | null {
  if (!isWebUrl(url)) return null;
  try {
    const parsed = new URL(url!);
    return parsed.origin + parsed.pathname;
  } catch {
    return null;
  }
}
