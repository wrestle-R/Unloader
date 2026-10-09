import { describe, expect, it } from "vitest";
import catalog from "../src/data/site-memory-estimates.json";
import { estimateForHostname, estimateForUrl, memoryCatalogMeta } from "../src/background/memory-estimates";

describe("site memory estimates", () => {
  it("ships a large, unique, positive catalog", () => {
    expect(memoryCatalogMeta.entries).toBeGreaterThanOrEqual(500);
    const domains = catalog.entries.map((entry) => entry.domain);
    expect(new Set(domains).size).toBe(domains.length);
    expect(catalog.entries.every((entry) => entry.estimatedMiB > 0)).toBe(true);
  });

  it("matches exact and parent domains", () => {
    expect(estimateForHostname("chatgpt.com").name).toBe("ChatGPT");
    expect(estimateForHostname("www.github.com").name).toBe("GitHub");
    expect(estimateForHostname("news.reddit.com").name).toBe("Reddit");
  });

  it("uses a documented low-confidence fallback", () => {
    const fallback = estimateForHostname("unknown-example.invalid");
    expect(fallback.estimatedMiB).toBe(memoryCatalogMeta.fallbackEstimatedMiB);
    expect(fallback.confidence).toBe("low");
    expect(estimateForUrl("not a url")).toEqual(expect.objectContaining({ name: "Unknown website" }));
  });
});
