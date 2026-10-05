import { describe, expect, it } from "vitest";
import { describePolicy, sortedTabs } from "../src/ui/utils";
import type { TabInfo } from "../src/shared/types";

function tab(id: number, title: string, today: number, week: number): TabInfo {
  return {
    id,
    windowId: 1,
    url: `https://example.org/${id}`,
    title,
    hostname: "example.org",
    active: false,
    pinned: false,
    audible: false,
    discarded: false,
    lastActiveAt: id * 1000,
    idleMinutes: 2,
    policyMode: "manual",
    timerMinutes: null,
    safety: { editing: false, media: false },
    usageTodayMs: today,
    usageWeekMs: week,
  };
}

describe("usage ordering", () => {
  it("sorts by focused use in the selected time window and preserves source order", () => {
    const tabs = [tab(1, "Mail", 5_000, 20_000), tab(2, "News", 15_000, 16_000), tab(3, "Chat", 10_000, 50_000)];
    expect(sortedTabs(tabs, "mostToday").map(({ title }) => title)).toEqual(["News", "Chat", "Mail"]);
    expect(sortedTabs(tabs, "leastWeek").map(({ title }) => title)).toEqual(["News", "Mail", "Chat"]);
    expect(tabs.map(({ title }) => title)).toEqual(["Mail", "News", "Chat"]);
  });

  it("handles a 300-tab window without dropping records", () => {
    const tabs = Array.from({ length: 300 }, (_, index) => tab(index + 1, `Page ${index}`, index * 1000, index * 2000));
    const sorted = sortedTabs(tabs, "mostWeek");
    expect(sorted).toHaveLength(300);
    expect(sorted[0]?.id).toBe(300);
    expect(sorted.at(-1)?.id).toBe(1);
  });
});

describe("unloading labels", () => {
  it("shows protection instead of misleading timers", () => {
    const timed = { ...tab(1, "Page", 0, 0), policyMode: "timed" as const, timerMinutes: 15 };
    expect(describePolicy(timed)).toBe("15 min timer");
    expect(describePolicy({ ...timed, pinned: true })).toBe("Pinned · protected");
    expect(describePolicy({ ...timed, url: "moz-extension://unloader/dashboard.html" })).toBe("Browser page · excluded");
    expect(describePolicy({ ...timed, pinned: true, policyMode: "awake" })).toBe("Keep awake");
    expect(describePolicy({ ...timed, active: true })).toBe("Active · protected");
    expect(describePolicy({ ...timed, safety: { editing: true, media: false } })).toBe("Editing · protected");
    expect(describePolicy({ ...timed, audible: true })).toBe("Media · protected");
  });
});
