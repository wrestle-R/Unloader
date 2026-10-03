import { describe, expect, it } from "vitest";
import { parseBenchmarkReport, sortedTabs } from "../src/ui/utils";
import type { BenchmarkReport, TabInfo } from "../src/shared/types";

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

describe("benchmark report import", () => {
  const valid: BenchmarkReport = {
    schema: 1,
    generatedAt: "2026-10-03T10:00:00.000Z",
    browser: "Chromium 153",
    platform: "linux x64",
    series: [{
      tabs: 20,
      condition: "idle",
      baselineMedianPssKiB: 500_000,
      extensionMedianPssKiB: 510_000,
      deltaMedianPssKiB: 10_000,
      runs: 3,
      cpuPercent: 0.4,
    }],
  };

  it("accepts a measured browser comparison", () => {
    expect(parseBenchmarkReport(valid)).toEqual(valid);
  });

  it("rejects malformed conditions and impossible memory readings", () => {
    expect(() => parseBenchmarkReport({ ...valid, series: [{ ...valid.series[0], condition: "guessed" }] }))
      .toThrow();
    expect(() => parseBenchmarkReport({ ...valid, series: [{ ...valid.series[0], baselineMedianPssKiB: -1 }] }))
      .toThrow();
  });
});
