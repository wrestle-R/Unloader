import catalog from "../data/site-memory-estimates.json";

export type EstimateConfidence = "medium" | "low";
export interface SiteMemoryEstimate {
  domain: string;
  name: string;
  category: string;
  estimatedMiB: number;
  confidence: EstimateConfidence;
}

const entries = catalog.entries as SiteMemoryEstimate[];
const byDomain = new Map(entries.map((entry) => [entry.domain, entry]));

export const memoryCatalogMeta = {
  version: catalog.version,
  entries: entries.length,
  fallbackEstimatedMiB: catalog.fallbackEstimatedMiB,
};

export function estimateForHostname(value: string): SiteMemoryEstimate {
  const hostname = value.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (hostname) {
    const labels = hostname.split(".");
    for (let index = 0; index < labels.length - 1; index += 1) {
      const match = byDomain.get(labels.slice(index).join("."));
      if (match) return match;
    }
  }
  return {
    domain: hostname || "unknown",
    name: "Unknown website",
    category: "other",
    estimatedMiB: catalog.fallbackEstimatedMiB,
    confidence: "low",
  };
}

export function estimateForUrl(url: string | undefined): SiteMemoryEstimate {
  try { return estimateForHostname(new URL(url ?? "").hostname); }
  catch { return estimateForHostname(""); }
}
