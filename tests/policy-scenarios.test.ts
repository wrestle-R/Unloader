import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  chooseReplacementTab,
  parseSettings,
  resolvePolicy,
  shouldAutoUnload,
  usageKey,
  type AutoUnloadCandidate,
} from "../src/background/policy";
import type { Settings } from "../src/shared/types";

const now = Date.UTC(2026, 9, 3, 12);

function candidate(overrides: Partial<AutoUnloadCandidate> = {}): AutoUnloadCandidate {
  return {
    url: "https://news.example.org/read?draft=1#part",
    active: false,
    pinned: false,
    audible: false,
    discarded: false,
    loading: false,
    lastActiveAt: now - 30 * 60_000,
    safety: { editing: false, media: false },
    ...overrides,
  };
}

describe("automatic unloading decisions", () => {
  it("enables a 15-minute timer on fresh installs and respects explicit site timers", () => {
    expect(DEFAULT_SETTINGS.globalIdleMinutes).toBe(15);
    expect(shouldAutoUnload(candidate(), DEFAULT_SETTINGS, now)).toBe(true);
    expect(shouldAutoUnload(candidate({ lastActiveAt: now - 14 * 60_000 }), DEFAULT_SETTINGS, now)).toBe(false);
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      siteRules: { "news.example.org": { mode: "timed", minutes: 10 } },
    };
    expect(resolvePolicy("news.example.org", settings)).toEqual({ mode: "timed", minutes: 10 });
    expect(shouldAutoUnload(candidate(), settings, now)).toBe(true);
    expect(shouldAutoUnload(candidate({ lastActiveAt: now - 9 * 60_000 }), settings, now)).toBe(false);
  });

  it("respects site overrides over a 15-minute global timer", () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      globalIdleMinutes: 15,
      siteRules: {
        "web.whatsapp.com": { mode: "awake" },
        "mail.example.org": { mode: "manual" },
        "news.example.org": { mode: "timed", minutes: 60 },
      },
    };
    expect(shouldAutoUnload(candidate({ url: "https://web.whatsapp.com/" }), settings, now)).toBe(false);
    expect(shouldAutoUnload(candidate({ url: "https://mail.example.org/" }), settings, now)).toBe(false);
    expect(shouldAutoUnload(candidate(), settings, now)).toBe(false);
    expect(shouldAutoUnload(candidate({ url: "https://other.example.org/" }), settings, now)).toBe(true);
  });

  it.each([
    ["active", { active: true }],
    ["pinned", { pinned: true }],
    ["audible", { audible: true }],
    ["editing", { safety: { editing: true, media: false } }],
    ["media", { safety: { editing: false, media: true } }],
    ["loading", { loading: true }],
    ["missing safety signals", { safety: null }],
    ["already discarded", { discarded: true }],
    ["browser page", { url: "chrome://extensions" }],
  ] as const)("keeps a %s tab loaded", (_name, override) => {
    expect(shouldAutoUnload(
      candidate(override),
      { ...DEFAULT_SETTINGS, globalIdleMinutes: 1 },
      now,
    )).toBe(false);
  });

  it("chooses the most recently used loaded replacement tab", () => {
    const tabs = [
      { id: 1, discarded: false, lastActiveAt: 50, index: 2 },
      { id: 2, discarded: false, lastActiveAt: 30, index: 1 },
      { id: 3, discarded: true, lastActiveAt: 100, index: 0 },
      { id: 4, discarded: false, lastActiveAt: 80, index: 3 },
    ];
    expect(chooseReplacementTab(4, tabs)).toBe(1);
    expect(chooseReplacementTab(1, tabs)).toBe(4);
    expect(chooseReplacementTab(1, [tabs[0]!, tabs[2]!])).toBeNull();
  });
});

describe("local data boundaries", () => {
  it("drops query strings and fragments from persisted usage keys", () => {
    expect(usageKey("https://web.whatsapp.com/chat/123?token=private#latest"))
      .toBe("https://web.whatsapp.com/chat/123");
    expect(usageKey("about:config")).toBeNull();
  });

  it("rejects malformed settings instead of importing partial rules", () => {
    const valid: Settings = {
      globalIdleMinutes: null,
      siteRules: { "web.whatsapp.com": { mode: "awake" } },
      theme: "system",
    };
    expect(parseSettings(valid)).toEqual(valid);
    expect(parseSettings({ ...valid, globalIdleMinutes: 0 })).toBeNull();
    expect(parseSettings({ ...valid, siteRules: { "web.whatsapp.com": { mode: "timed", minutes: 1441 } } }))
      .toBeNull();
    expect(parseSettings({ ...valid, siteRules: { "web.whatsapp.com/path": { mode: "awake" } } }))
      .toBeNull();
  });
});
