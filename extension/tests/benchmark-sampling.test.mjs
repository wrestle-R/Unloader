import { describe, expect, it } from "vitest";
import { cpuTicksBetween } from "../scripts/lib/webdriver.mjs";

describe("browser process CPU sampling", () => {
  it("counts new processes and ignores exited ones instead of going negative", () => {
    expect(cpuTicksBetween({ 10: 100, 11: 300 }, { 10: 112, 12: 7 })).toBe(19);
  });
});
