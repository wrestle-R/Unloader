#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const build = resolve(".output/firefox-mv2");
const catalog = JSON.parse(await readFile("src/data/site-memory-estimates.json", "utf8"));
const now = Date.now();
const samples = [
  ["Project workspace · GitHub", "github.com", false, "timed", 2],
  ["Team conversations · WhatsApp", "web.whatsapp.com", false, "awake", 5],
  ["Project notes · Notion", "notion.so", true, "timed", 38],
  ["Web platform documentation", "developer.mozilla.org", true, "timed", 26],
  ["Design files · Figma", "figma.com", true, "timed", 47],
  ["A soundtrack for work · Spotify", "open.spotify.com", false, "timed", 8],
];
function snapshot(theme) {
  return {
    settings: { globalIdleMinutes: 15, theme, siteRules: {
      "web.whatsapp.com": { mode: "awake" },
      "github.com": { mode: "manual" },
      "figma.com": { mode: "timed", minutes: 30 },
    } },
    tabs: samples.map(([title, hostname, discarded, policyMode, idleMinutes], i) => ({
      id: i + 1, windowId: 1, url: `https://${hostname}/`, title, hostname,
      active: i === 0, pinned: false, audible: i === 5, discarded,
      lastActiveAt: now - i * 60000, idleMinutes, policyMode,
      timerMinutes: policyMode === "awake" ? null : hostname === "figma.com" ? 30 : 15,
      safety: { editing: false, media: i === 5 }, usageTodayMs: 0, usageWeekMs: 0,
    })),
    activity: [
      { id: "demo-1", at: now - 900000, hostname: "notion.so", action: "unload", reason: "Idle timer", estimatedMiB: 360 },
      { id: "demo-2", at: now - 1800000, hostname: "github.com", action: "restore", reason: "Tab activated or reloaded" },
      { id: "demo-3", at: now - 2400000, hostname: "figma.com", action: "unload", reason: "Manual", estimatedMiB: 620 },
    ],
    stats: { scanCount: 12, lastScanAt: now, lastScanDurationMs: 2, trackedTabs: 6, storageBytes: 4096 },
    shortcut: "Ctrl+Shift+U",
    memory: {
      currentEstimatedMiB: 1160, cumulativeEstimatedMiB: 6280,
      daily: [480, 790, 0, 1100, 620, 910, 2380].map((estimatedMiB, index) => {
        const day = new Date(now);
        day.setDate(day.getDate() - 6 + index);
        return { day: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`, estimatedMiB };
      }),
      catalogEntries: catalog.entries.length, catalogVersion: catalog.version,
      fallbackEstimatedMiB: catalog.fallbackEstimatedMiB,
    },
  };
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
    if (url.pathname === "/") {
      const section = url.searchParams.get("section") || "tabs";
      res.writeHead(302, { location: `/dashboard.html?theme=${theme}#${section}` });
      res.end();
      return;
    }
    if (["/dashboard.html", "/popup.html"].includes(url.pathname)) {
      const html = await readFile(resolve(build, "." + url.pathname), "utf8");
      const shim = `<script>
        const event = { addListener(){}, removeListener(){} };
        const demo = ${JSON.stringify(snapshot(theme))};
        document.documentElement.dataset.theme = demo.settings.theme;
        window.browser = {
          runtime: {
            id: "unloader-preview",
            getURL: path => location.origin + path,
            sendMessage: async message => {
              if (message.type === "setTheme") demo.settings.theme = message.theme;
              return { ok: true, data: message.type === "setTheme" ? demo.settings : demo };
            }
          },
          tabs: { onCreated:event, onRemoved:event, onUpdated:event, onActivated:event },
          windows: { onFocusChanged:event }
        };
      </script>`;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(html.replace("<head>", `<head>${shim}`));
      return;
    }
    const file = resolve(build, "." + url.pathname);
    if (!file.startsWith(build + "/")) throw new Error("Invalid path");
    res.setHeader("content-type", ({
      ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png",
    })[extname(file)] || "application/octet-stream");
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
}).listen(4319, "127.0.0.1", () => process.stdout.write("Preview: http://127.0.0.1:4319\n"));
