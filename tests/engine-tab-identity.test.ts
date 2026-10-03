import { describe, expect, it } from "vitest";
import { remapTabIdentity } from "../src/background/tab-identity";

describe("Chromium tab replacement after native discard", () => {
  it("moves the tracked tab, manual sleep, and focus to the returned ID", () => {
    const meta = { windowId: 2, key: "https://example.com/page", lastActiveAt: 123 };
    const state = {
      tabMeta: { "41": meta },
      manualSleep: { "41": true as const },
      focus: { tabId: 41 },
    };

    remapTabIdentity(state, 41, 42);

    expect(state.tabMeta).toEqual({ "42": meta });
    expect(state.manualSleep).toEqual({ "42": true });
    expect(state.focus.tabId).toBe(42);
  });

  it("leaves stable IDs alone, as Firefox may retain the original ID", () => {
    const state = {
      tabMeta: { "8": { key: "https://example.com" } },
      manualSleep: {},
      focus: null,
    };

    remapTabIdentity(state, 8, 8);

    expect(state.tabMeta).toEqual({ "8": { key: "https://example.com" } });
  });
});
