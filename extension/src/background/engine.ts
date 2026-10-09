import { browser, type Browser } from "wxt/browser";
import type {
  ActivityEntry,
  BackgroundStats,
  DashboardSnapshot,
  ExportedSettings,
  RequestMessage,
  ResponseMessage,
  SafetySignals,
  Settings,
  TabInfo,
  UnloadResult,
} from "../shared/types";
import {
  DEFAULT_SETTINGS,
  autoUnloadDueAt,
  chooseReplacementTab,
  hostnameFromUrl,
  isWebUrl,
  normalizeHostname,
  parseSettings,
  parseSiteRule,
  resolvePolicy,
  shouldAutoUnload,
  usageKey,
  validMinutes,
} from "./policy";
import { remapTabIdentity } from "./tab-identity";
import { estimateForUrl, memoryCatalogMeta } from "./memory-estimates";

type Tab = Browser.tabs.Tab;
type Sender = Browser.runtime.MessageSender;

interface TabMeta {
  windowId: number;
  key: string;
  lastActiveAt: number;
  wasDiscarded: boolean;
  protectedByUs: boolean;
}

interface FocusSession {
  tabId: number;
  windowId: number;
  key: string;
  at: number;
}

interface PersistedState {
  settings: Settings;
  tabMeta: Record<string, TabMeta>;
  activity: ActivityEntry[];
  dailyUsage: Record<string, Record<string, number>>;
  focus: FocusSession | null;
  stats: Pick<BackgroundStats, "scanCount" | "lastScanAt" | "lastScanDurationMs">;
  startupWakeUntil: number;
  manualSleep: Record<string, true>;
  memoryReleasedMiB: number;
  dailyMemoryReleased: Record<string, number>;
}

const STORAGE_KEY = "unloaderState";
const ALARM_NAME = "unloader-checkpoint";
const CHECKPOINT_MS = 5 * 60_000;
const STARTUP_WAKE_MS = 2 * 60_000;
const MAX_ACTIVITY = 100;

function initialState(): PersistedState {
  return {
    settings: structuredClone(DEFAULT_SETTINGS),
    tabMeta: {},
    activity: [],
    dailyUsage: {},
    focus: null,
    stats: { scanCount: 0, lastScanAt: null, lastScanDurationMs: null },
    startupWakeUntil: 0,
    manualSleep: {},
    memoryReleasedMiB: 0,
    dailyMemoryReleased: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function loadState(value: unknown): PersistedState {
  const fresh = initialState();
  if (!isRecord(value)) return fresh;
  fresh.settings = parseSettings(value.settings) ?? fresh.settings;
  if (isRecord(value.tabMeta)) {
    for (const [id, raw] of Object.entries(value.tabMeta)) {
      if (!/^\d+$/.test(id) || !isRecord(raw)) continue;
      if (typeof raw.windowId !== "number" || typeof raw.key !== "string" || typeof raw.lastActiveAt !== "number") continue;
      fresh.tabMeta[id] = {
        windowId: raw.windowId,
        key: raw.key,
        lastActiveAt: raw.lastActiveAt,
        wasDiscarded: raw.wasDiscarded === true,
        protectedByUs: raw.protectedByUs === true,
      };
    }
  }
  if (Array.isArray(value.activity)) {
    fresh.activity = value.activity.filter((entry): entry is ActivityEntry =>
      isRecord(entry) && typeof entry.id === "string" && typeof entry.at === "number" &&
      typeof entry.hostname === "string" &&
      ["unload", "restore", "blocked"].includes(String(entry.action)) && typeof entry.reason === "string",
    ).slice(0, MAX_ACTIVITY);
  }
  if (isRecord(value.dailyUsage)) {
    for (const [day, raw] of Object.entries(value.dailyUsage)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isRecord(raw)) continue;
      const entries: Record<string, number> = {};
      for (const [key, ms] of Object.entries(raw)) {
        if (typeof ms === "number" && Number.isFinite(ms) && ms >= 0 && key.length <= 2048) entries[key] = ms;
      }
      fresh.dailyUsage[day] = entries;
    }
  }
  if (isRecord(value.focus) && typeof value.focus.tabId === "number" &&
      typeof value.focus.windowId === "number" && typeof value.focus.key === "string" &&
      typeof value.focus.at === "number") {
    fresh.focus = value.focus as unknown as FocusSession;
  }
  if (isRecord(value.stats)) {
    fresh.stats = {
      scanCount: typeof value.stats.scanCount === "number" ? value.stats.scanCount : 0,
      lastScanAt: typeof value.stats.lastScanAt === "number" ? value.stats.lastScanAt : null,
      lastScanDurationMs: typeof value.stats.lastScanDurationMs === "number" ? value.stats.lastScanDurationMs : null,
    };
  }
  fresh.startupWakeUntil = typeof value.startupWakeUntil === "number" ? value.startupWakeUntil : 0;
  if (isRecord(value.manualSleep)) {
    for (const [id, flag] of Object.entries(value.manualSleep)) {
      if (/^\d+$/.test(id) && flag === true) fresh.manualSleep[id] = true;
    }
  }
  fresh.memoryReleasedMiB = typeof value.memoryReleasedMiB === "number" && value.memoryReleasedMiB >= 0 ? value.memoryReleasedMiB : 0;
  if (isRecord(value.dailyMemoryReleased)) {
    for (const [day, amount] of Object.entries(value.dailyMemoryReleased)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && typeof amount === "number" && amount >= 0) fresh.dailyMemoryReleased[day] = amount;
    }
  }
  pruneUsage(fresh, Date.now());
  return fresh;
}

function localDay(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function weekDays(now: number): string[] {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(date);
    day.setDate(day.getDate() - offset);
    return localDay(day.getTime());
  });
}

function pruneUsage(state: PersistedState, now: number): void {
  const allowed = new Set(weekDays(now));
  for (const day of Object.keys(state.dailyUsage)) {
    if (!allowed.has(day)) delete state.dailyUsage[day];
  }
  for (const day of Object.keys(state.dailyMemoryReleased)) {
    if (!allowed.has(day)) delete state.dailyMemoryReleased[day];
  }
}

function recordActivity(state: PersistedState, tab: Tab, action: ActivityEntry["action"], reason: string): void {
  const estimatedMiB = action === "unload" ? estimateForUrl(tab.url).estimatedMiB : undefined;
  state.activity.unshift({
    id: crypto.randomUUID(),
    at: Date.now(),
    hostname: hostnameFromUrl(tab.url),
    action,
    reason,
    ...(estimatedMiB === undefined ? {} : { estimatedMiB }),
  });
  if (estimatedMiB !== undefined) {
    state.memoryReleasedMiB += estimatedMiB;
    const day = localDay(Date.now());
    state.dailyMemoryReleased[day] = (state.dailyMemoryReleased[day] ?? 0) + estimatedMiB;
  }
  state.activity.length = Math.min(state.activity.length, MAX_ACTIVITY);
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Registers listeners synchronously so MV3 can wake for events. */
export function startBackground(): void {
  let state = initialState();
  let initPromise: Promise<void> | null = null;
  let taskQueue: Promise<unknown> = Promise.resolve();
  let rescheduleTimer: ReturnType<typeof setTimeout> | null = null;
  let scanTimer: ReturnType<typeof setTimeout> | null = null;
  const safetyByTab = new Map<number, Map<number, SafetySignals>>();
  let focusedWindowId = -1;
  let userActive = true;
  let lastShortcutAt = 0;

  async function save(): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEY]: state });
  }

  function remapTab(oldId: number, newId: number): void {
    if (oldId === newId) return;
    remapTabIdentity(state, oldId, newId);
    // The old document has been torn down, so its safety report is stale.
    safetyByTab.delete(oldId);
    safetyByTab.delete(newId);
  }

  function metaFor(tab: Tab, now = Date.now()): TabMeta | null {
    if (tab.id === undefined || tab.incognito) return null;
    const id = String(tab.id);
    const key = usageKey(tab.url) ?? "";
    const existing = state.tabMeta[id];
    if (!existing || existing.windowId !== tab.windowId) {
      state.tabMeta[id] = {
        windowId: tab.windowId,
        key,
        lastActiveAt: now,
        wasDiscarded: tab.discarded === true,
        protectedByUs: false,
      };
    } else if (existing.key !== key) {
      // Protection belongs to the tab until we can undo it after navigation.
      existing.key = key;
      existing.lastActiveAt = now;
      existing.wasDiscarded = tab.discarded === true;
    }
    return state.tabMeta[id] ?? null;
  }

  function safetyFor(tabId: number): SafetySignals | null {
    const frames = safetyByTab.get(tabId);
    if (!frames?.has(0)) return null;
    return {
      editing: [...frames.values()].some((value) => value.editing),
      media: [...frames.values()].some((value) => value.media),
    };
  }

  async function refreshSafety(tabId: number): Promise<SafetySignals | null> {
    try {
      await browser.tabs.sendMessage(tabId, { type: "getSafety" });
      // Each frame reports separately; a broadcast response represents only one frame.
      await new Promise<void>((resolve) => setTimeout(resolve, 75));
    } catch {
      // The tab may be navigating, or content access may have been revoked.
    }
    return safetyFor(tabId);
  }

  function checkpointUsage(now: number): void {
    const focus = state.focus;
    if (!focus || now <= focus.at) return;
    let cursor = focus.at;
    while (cursor < now) {
      const date = new Date(cursor);
      const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
      const end = Math.min(now, midnight);
      const day = localDay(cursor);
      const bucket = state.dailyUsage[day] ?? (state.dailyUsage[day] = {});
      bucket[focus.key] = (bucket[focus.key] ?? 0) + end - cursor;
      cursor = end;
    }
    focus.at = now;
    pruneUsage(state, now);
  }

  async function currentFocusedTab(now = Date.now()): Promise<void> {
    if (!userActive || focusedWindowId < 0) {
      state.focus = null;
      return;
    }
    const active = (await browser.tabs.query({ active: true, windowId: focusedWindowId }))[0];
    const key = usageKey(active?.url);
    if (!active || active.id === undefined || active.incognito || !key) {
      state.focus = null;
      return;
    }
    state.focus = { tabId: active.id, windowId: active.windowId, key, at: now };
    metaFor(active, now)!.lastActiveAt = now;
  }

  async function syncProtection(tabs: Tab[]): Promise<void> {
    for (const tab of tabs) {
      if (tab.id === undefined || tab.incognito || !isWebUrl(tab.url)) continue;
      const meta = metaFor(tab);
      if (!meta) continue;
      const isAwake = resolvePolicy(hostnameFromUrl(tab.url), state.settings).mode === "awake";
      try {
        if (isAwake && tab.autoDiscardable !== false) {
          await browser.tabs.update(tab.id, { autoDiscardable: false });
          meta.protectedByUs = true;
        } else if (!isAwake && meta.protectedByUs) {
          await browser.tabs.update(tab.id, { autoDiscardable: true });
          meta.protectedByUs = false;
        }
      } catch {
        // A tab can close or navigate between query and update.
      }
    }
  }

  async function wakeAwakeTab(tab: Tab): Promise<void> {
    if (tab.id === undefined || tab.incognito || !tab.discarded || !isWebUrl(tab.url)) return;
    if (state.manualSleep[String(tab.id)]) return;
    if (resolvePolicy(hostnameFromUrl(tab.url), state.settings).mode !== "awake") return;
    try {
      await browser.tabs.reload(tab.id);
    } catch {
      // Some restored tabs are not ready yet. A subsequent tab update retries.
    }
  }

  async function initialize(): Promise<void> {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    state = loadState(stored[STORAGE_KEY]);
    const tabs = await browser.tabs.query({});
    const liveIds = new Set(tabs.filter((tab) => !tab.incognito && tab.id !== undefined).map((tab) => String(tab.id)));
    for (const id of Object.keys(state.tabMeta)) if (!liveIds.has(id)) delete state.tabMeta[id];
    for (const id of Object.keys(state.manualSleep)) if (!liveIds.has(id)) delete state.manualSleep[id];
    for (const tab of tabs) metaFor(tab);
    try {
      const focused = await browser.windows.getLastFocused();
      focusedWindowId = focused.focused && !focused.incognito && focused.id !== undefined ? focused.id : -1;
    } catch {
      focusedWindowId = -1;
    }
    try {
      // Quiet reading and video viewing count while the browser stays focused.
      userActive = (await browser.idle.queryState(60)) !== "locked";
    } catch {
      userActive = true;
    }
    const active = tabs.find((tab) => tab.active && tab.windowId === focusedWindowId);
    if (!state.focus || !active || state.focus.tabId !== active.id ||
        state.focus.key !== usageKey(active.url) || !userActive) {
      await currentFocusedTab();
    }
    await syncProtection(tabs);
    await save();
    await scheduleAlarm(tabs);
  }

  function ensureInit(): Promise<void> {
    if (!initPromise) initPromise = initialize().catch((error) => {
      initPromise = null;
      throw error;
    });
    return initPromise;
  }

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = taskQueue.then(async () => {
      await ensureInit();
      return work();
    });
    taskQueue = next.catch((error) => {
      console.error("Unloader background task failed", error);
    });
    return next;
  }

  function queueReschedule(): void {
    if (rescheduleTimer !== null) return;
    rescheduleTimer = setTimeout(() => {
      rescheduleTimer = null;
      void enqueue(async () => scheduleAlarm());
    }, 250);
  }

  function queueScan(): void {
    if (scanTimer !== null) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      void enqueue(async () => scanAutomatic());
    }, 500);
  }

  async function scheduleAlarm(knownTabs?: Tab[]): Promise<void> {
    const now = Date.now();
    const tabs = knownTabs ?? await browser.tabs.query({});
    let next = now + CHECKPOINT_MS;
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    next = Math.min(next, midnight.getTime());
    for (const tab of tabs) {
      if (tab.id === undefined || tab.incognito || !isWebUrl(tab.url) || tab.active || tab.discarded || tab.pinned || tab.audible) continue;
      const minutes = resolvePolicy(hostnameFromUrl(tab.url), state.settings).minutes;
      if (minutes === null) continue;
      const safety = safetyFor(tab.id);
      if (safety?.editing || safety?.media || tab.status === "loading") continue;
      const due = (metaFor(tab)?.lastActiveAt ?? now) + minutes * 60_000;
      if (due > now) next = Math.min(next, due);
    }
    await browser.alarms.create(ALARM_NAME, { when: Math.max(now + 30_000, next) });
  }

  async function scanAutomatic(): Promise<void> {
    const started = performance.now();
    const now = Date.now();
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (tab.id === undefined || tab.incognito || !isWebUrl(tab.url)) continue;
      const meta = metaFor(tab, now);
      if (!meta) continue;
      const policy = resolvePolicy(hostnameFromUrl(tab.url), state.settings);
      if (policy.mode !== "timed" || policy.minutes === null ||
          meta.lastActiveAt + policy.minutes * 60_000 > now || tab.active || tab.pinned ||
          tab.audible || tab.discarded || tab.status === "loading") continue;
      let safety = safetyFor(tab.id);
      if (!safety) safety = await refreshSafety(tab.id);
      if (!shouldAutoUnload({
        url: tab.url ?? "", active: false, pinned: false, audible: false,
        discarded: false, loading: false,
        lastActiveAt: meta.lastActiveAt, safety,
      }, state.settings, now)) continue;
      try {
        const current = await browser.tabs.get(tab.id);
        if (current.url !== tab.url || current.active || current.pinned || current.audible ||
            current.discarded || current.status === "loading") continue;
        const currentSafety = safetyFor(tab.id);
        if (!currentSafety || currentSafety.editing || currentSafety.media) continue;
        const discarded = await browser.tabs.discard(tab.id);
        const updated = discarded?.id !== undefined ? discarded : await browser.tabs.get(tab.id);
        if (updated.discarded) {
          remapTab(tab.id, updated.id ?? tab.id);
          const currentMeta = metaFor(updated) ?? meta;
          currentMeta.wasDiscarded = true;
          recordActivity(state, updated, "unload", "Idle timer");
        }
      } catch {
        // Native browser rules may refuse an otherwise eligible tab.
      }
    }
    state.stats.scanCount += 1;
    state.stats.lastScanAt = Date.now();
    state.stats.lastScanDurationMs = Math.round(performance.now() - started);
    await save();
    await scheduleAlarm();
  }

  async function unloadTab(
    tabId: number,
    force = false,
    source = "Manual",
    expectedUrl?: string,
  ): Promise<UnloadResult> {
    if (!Number.isInteger(tabId) || tabId < 0) throw new Error("Invalid tab.");
    let tab: Tab;
    try {
      tab = await browser.tabs.get(tabId);
    } catch {
      return { status: "blocked", tabId, message: "That tab no longer exists." };
    }
    if (tab.incognito || !isWebUrl(tab.url)) {
      return { status: "blocked", tabId, message: "This page cannot be unloaded by Unloader." };
    }
    if (force && (!expectedUrl || expectedUrl !== tab.url)) {
      return { status: "blocked", tabId, message: "The page changed. Review it again before unloading." };
    }
    if (tab.discarded) return { status: "done", tabId, message: "Already unloaded." };
    const safety = safetyFor(tabId) ?? await refreshSafety(tabId);
    if (!force && (tab.pinned || tab.audible || safety?.editing || safety?.media || !safety)) {
      const reason = !safety ? "Page safety could not be checked" :
        tab.pinned ? "Pinned tab" : tab.audible ? "Audio is playing" : safety.editing ? "Unsaved editing may be in progress" : "Media is playing";
      return { status: "needs_confirmation", tabId, message: reason };
    }
    if (tab.active) {
      const peers = await browser.tabs.query({ windowId: tab.windowId });
      const replacementId = chooseReplacementTab(tabId, peers.filter((peer) => peer.id !== undefined).map((peer) => ({
        id: peer.id!, discarded: peer.discarded === true,
        lastActiveAt: state.tabMeta[String(peer.id)]?.lastActiveAt ?? 0,
        index: peer.index,
      })));
      if (replacementId === null) {
        await browser.tabs.create({ windowId: tab.windowId, active: true, url: "about:blank" });
      } else {
        await browser.tabs.update(replacementId, { active: true });
      }
    }
    try {
      const current = await browser.tabs.get(tabId);
      if (current.url !== tab.url || current.active) {
        return { status: "blocked", tabId, message: "The page changed or became active. Review it again before unloading." };
      }
      if (!force) {
        const currentSafety = safetyFor(tabId);
        if (current.pinned || current.audible || !currentSafety || currentSafety.editing || currentSafety.media) {
          return { status: "needs_confirmation", tabId, message: "This page may contain active work or media." };
        }
      }
      const discarded = await browser.tabs.discard(tabId);
      const updated = discarded?.id !== undefined ? discarded : await browser.tabs.get(tabId);
      if (!updated.discarded) throw new Error("The browser kept this tab loaded.");
      const newId = updated.id ?? tabId;
      remapTab(tabId, newId);
      state.manualSleep[String(newId)] = true;
      const meta = metaFor(updated);
      if (meta) meta.wasDiscarded = true;
      recordActivity(state, updated, "unload", source);
      await save();
      await scheduleAlarm();
      return { status: "done", tabId: newId };
    } catch (error) {
      recordActivity(state, tab, "blocked", safeError(error));
      await save();
      return { status: "blocked", tabId, message: safeError(error) };
    }
  }

  async function handleShortcut(tabId: number): Promise<UnloadResult | null> {
    const now = Date.now();
    if (now - lastShortcutAt < 1000) return null;
    lastShortcutAt = now;
    const result = await unloadTab(tabId, false, "Shortcut");
    if (result.status === "needs_confirmation") await openConfirmation(tabId);
    return result;
  }

  async function restoreTab(tabId: number): Promise<boolean> {
    if (!Number.isInteger(tabId) || tabId < 0) throw new Error("Invalid tab.");
    const tab = await browser.tabs.get(tabId);
    if (tab.incognito || !isWebUrl(tab.url)) throw new Error("This page cannot be restored by Unloader.");
    await browser.tabs.update(tabId, { active: true });
    await browser.windows.update(tab.windowId, { focused: true });
    delete state.manualSleep[String(tabId)];
    const meta = metaFor(tab);
    if (meta) meta.lastActiveAt = Date.now();
    await save();
    await scheduleAlarm();
    return true;
  }

  async function snapshot(): Promise<DashboardSnapshot> {
    const now = Date.now();
    checkpointUsage(now);
    const tabs = (await browser.tabs.query({})).filter((tab) => !tab.incognito && tab.id !== undefined);
    const today = localDay(now);
    const days = weekDays(now);
    const items: TabInfo[] = tabs.map((tab) => {
      const meta = metaFor(tab, now)!;
      const hostname = hostnameFromUrl(tab.url);
      const policy = resolvePolicy(hostname, state.settings);
      const key = usageKey(tab.url) ?? "";
      return {
        id: tab.id!, windowId: tab.windowId, url: tab.url ?? "", title: tab.title ?? "Untitled tab",
        hostname, favIconUrl: tab.favIconUrl, active: tab.active, pinned: tab.pinned,
        audible: tab.audible === true, discarded: tab.discarded === true,
        lastActiveAt: meta.lastActiveAt, idleMinutes: Math.max(0, Math.floor((now - meta.lastActiveAt) / 60_000)),
        policyMode: policy.mode, timerMinutes: policy.minutes,
        safety: safetyFor(tab.id!) ?? { editing: false, media: false },
        usageTodayMs: state.dailyUsage[today]?.[key] ?? 0,
        usageWeekMs: days.reduce((sum, day) => sum + (state.dailyUsage[day]?.[key] ?? 0), 0),
      };
    });
    let storageBytes = 0;
    try {
      storageBytes = await browser.storage.local.getBytesInUse(null);
    } catch {
      storageBytes = new TextEncoder().encode(JSON.stringify(state)).byteLength;
    }
    let shortcut: string | null = null;
    try {
      shortcut = (await browser.commands.getAll()).find((command) => command.name === "unload-current-tab")?.shortcut || null;
    } catch {
      shortcut = null;
    }
    await save();
    return {
      settings: structuredClone(state.settings), tabs: items, activity: [...state.activity],
      stats: { ...state.stats, trackedTabs: items.length, storageBytes }, shortcut,
      memory: {
        currentEstimatedMiB: items.filter((tab) => tab.discarded).reduce((sum, tab) => sum + estimateForUrl(tab.url).estimatedMiB, 0),
        cumulativeEstimatedMiB: state.memoryReleasedMiB,
        daily: [...days].reverse().map((day) => ({ day, estimatedMiB: state.dailyMemoryReleased[day] ?? 0 })),
        catalogEntries: memoryCatalogMeta.entries,
        catalogVersion: memoryCatalogMeta.version,
        fallbackEstimatedMiB: memoryCatalogMeta.fallbackEstimatedMiB,
      },
    };
  }

  async function openConfirmation(tabId: number): Promise<void> {
    const base = browser.runtime.getURL("/dashboard.html");
    const url = `${base}?confirmTab=${tabId}`;
    const existing = (await browser.tabs.query({})).find((tab) => !tab.incognito && tab.url?.startsWith(base));
    if (existing?.id !== undefined) {
      await browser.tabs.update(existing.id, { url, active: true });
      await browser.windows.update(existing.windowId, { focused: true });
    } else {
      await browser.tabs.create({ url, active: true });
    }
  }

  async function handleMessage(message: RequestMessage, sender: Sender): Promise<unknown> {
    switch (message.type) {
      case "getSnapshot":
        return snapshot();
      case "setGlobalMinutes":
        if (message.minutes !== null && !validMinutes(message.minutes)) throw new Error("Timer must be 1–1,440 minutes.");
        state.settings.globalIdleMinutes = message.minutes;
        await save();
        await scanAutomatic();
        return structuredClone(state.settings);
      case "setTheme":
        if (!["system", "light", "dark"].includes(message.theme)) throw new Error("Invalid theme.");
        state.settings.theme = message.theme;
        await save();
        return structuredClone(state.settings);
      case "setRule": {
        const host = normalizeHostname(message.hostname);
        if (!host) throw new Error("Enter an exact website hostname.");
        const rule = message.rule === null ? null : parseSiteRule(message.rule);
        if (message.rule !== null && !rule) throw new Error("Invalid website rule.");
        if (rule) state.settings.siteRules[host] = rule;
        else delete state.settings.siteRules[host];
        const tabs = await browser.tabs.query({});
        await syncProtection(tabs);
        await save();
        await scanAutomatic();
        return structuredClone(state.settings);
      }
      case "unloadTab":
        return unloadTab(message.tabId, message.force === true, "Manual", message.expectedUrl);
      case "shortcutFromPage":
        if (sender.tab?.id === undefined || sender.tab.incognito) {
          throw new Error("The shortcut must come from a webpage tab.");
        }
        return handleShortcut(sender.tab.id);
      case "openShortcutSettings": {
        const isFirefox = /firefox/i.test(navigator.userAgent);
        const url = isFirefox ? "about:addons" : "chrome://extensions/shortcuts";
        try {
          await browser.tabs.create({ url });
          return { opened: true, url, message: isFirefox ? "Open Extensions, then Manage Extension Shortcuts." : "Shortcut settings opened." };
        } catch {
          return { opened: false, url, message: isFirefox ? "Open Add-ons Manager → Extensions → Manage Extension Shortcuts." : `Open ${url} in the address bar.` };
        }
      }
      case "restoreTab":
        return restoreTab(message.tabId);
      case "clearActivity":
        state.activity = [];
        await save();
        return true;
      case "exportSettings":
        return { schema: 1, settings: structuredClone(state.settings) } satisfies ExportedSettings;
      case "importSettings": {
        const value = message.value;
        if (!isRecord(value) || value.schema !== 1) throw new Error("Unsupported settings file.");
        const parsed = parseSettings(value.settings);
        if (!parsed) throw new Error("Invalid settings file.");
        state.settings = parsed;
        const tabs = await browser.tabs.query({});
        await syncProtection(tabs);
        await save();
        await scanAutomatic();
        return structuredClone(state.settings);
      }
      case "safetyUpdate": {
        if (sender.tab?.id === undefined || sender.tab.incognito ||
            typeof message.safety?.editing !== "boolean" || typeof message.safety?.media !== "boolean") {
          throw new Error("Invalid safety update.");
        }
        const frames = safetyByTab.get(sender.tab.id) ?? new Map<number, SafetySignals>();
        frames.set(sender.frameId ?? 0, { editing: message.safety.editing, media: message.safety.media });
        safetyByTab.set(sender.tab.id, frames);
        queueReschedule();
        return true;
      }
      default:
        throw new Error("Unknown request.");
    }
  }

  browser.runtime.onMessage.addListener((message: RequestMessage, sender, sendResponse) => {
    if (!message || typeof message !== "object" || typeof message.type !== "string") return false;
    if (message.type === "safetyUpdate") {
      if (sender.tab?.id === undefined || sender.tab.incognito ||
          typeof message.safety?.editing !== "boolean" || typeof message.safety?.media !== "boolean") {
        sendResponse({ ok: false, error: "Invalid safety update." } satisfies ResponseMessage<unknown>);
        return false;
      }
      const frames = safetyByTab.get(sender.tab.id) ?? new Map<number, SafetySignals>();
      frames.set(sender.frameId ?? 0, { editing: message.safety.editing, media: message.safety.media });
      safetyByTab.set(sender.tab.id, frames);
      const hostname = hostnameFromUrl(sender.tab.url);
      const policy = resolvePolicy(hostname, state.settings);
      const lastActiveAt = state.tabMeta[String(sender.tab.id)]?.lastActiveAt;
      if (policy.minutes !== null && lastActiveAt !== undefined &&
          lastActiveAt + policy.minutes * 60_000 <= Date.now() &&
          !message.safety.editing && !message.safety.media) {
        queueScan();
      } else {
        queueReschedule();
      }
      sendResponse({ ok: true, data: true } satisfies ResponseMessage<unknown>);
      return false;
    }
    void enqueue(() => handleMessage(message, sender)).then(
      (data) => sendResponse({ ok: true, data } satisfies ResponseMessage<unknown>),
      (error) => sendResponse({ ok: false, error: safeError(error) } satisfies ResponseMessage<unknown>),
    );
    return true;
  });

  browser.commands.onCommand.addListener((command) => {
    if (command !== "unload-current-tab") return;
    void enqueue(async () => {
      const tab = (await browser.tabs.query({ active: true, lastFocusedWindow: true }))[0];
      if (tab?.id === undefined || tab.incognito) return;
      await handleShortcut(tab.id);
    });
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== ALARM_NAME) return;
    void enqueue(async () => {
      checkpointUsage(Date.now());
      await scanAutomatic();
    });
  });

  browser.runtime.onStartup.addListener(() => {
    void enqueue(async () => {
      state.focus = null;
      state.manualSleep = {};
      state.startupWakeUntil = Date.now() + STARTUP_WAKE_MS;
      await currentFocusedTab();
      const tabs = await browser.tabs.query({});
      await syncProtection(tabs);
      await Promise.allSettled(tabs.map(wakeAwakeTab));
      await save();
      await scheduleAlarm(tabs);
    });
  });

  browser.tabs.onActivated.addListener((activeInfo) => {
    void enqueue(async () => {
      const now = Date.now();
      checkpointUsage(now);
      const tab = await browser.tabs.get(activeInfo.tabId);
      const meta = metaFor(tab, now);
      if (meta) meta.lastActiveAt = now;
      if (activeInfo.windowId === focusedWindowId && userActive) await currentFocusedTab(now);
      else state.focus = null;
      if (!tab.discarded) delete state.manualSleep[String(activeInfo.tabId)];
      await save();
      await scheduleAlarm();
    });
  });

  browser.tabs.onCreated.addListener((tab) => {
    if (tab.incognito) return;
    void enqueue(async () => {
      metaFor(tab);
      await syncProtection([tab]);
      if (Date.now() <= state.startupWakeUntil) await wakeAwakeTab(tab);
      await save();
      await scheduleAlarm();
    });
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.incognito || !["url", "status", "discarded", "pinned", "audible", "autoDiscardable"].some((key) => key in changeInfo)) return;
    void enqueue(async () => {
      const now = Date.now();
      if (changeInfo.url || changeInfo.status === "loading") safetyByTab.delete(tabId);
      if (state.focus?.tabId === tabId && changeInfo.url) {
        checkpointUsage(now);
        state.focus = null;
        await currentFocusedTab(now);
      }
      const meta = metaFor(tab, now);
      if (meta && changeInfo.discarded === true) meta.wasDiscarded = true;
      if (meta && changeInfo.discarded === false && meta.wasDiscarded) {
        meta.wasDiscarded = false;
        delete state.manualSleep[String(tabId)];
        recordActivity(state, tab, "restore", "Tab activated or reloaded");
      }
      if (changeInfo.url || changeInfo.autoDiscardable !== undefined) await syncProtection([tab]);
      if (Date.now() <= state.startupWakeUntil && changeInfo.discarded === true) await wakeAwakeTab(tab);
      await save();
      queueReschedule();
    });
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void enqueue(async () => {
      if (state.focus?.tabId === tabId) {
        checkpointUsage(Date.now());
        state.focus = null;
      }
      delete state.tabMeta[String(tabId)];
      delete state.manualSleep[String(tabId)];
      safetyByTab.delete(tabId);
      await save();
      queueReschedule();
    });
  });

  browser.tabs.onReplaced?.addListener((newId, oldId) => {
    void enqueue(async () => {
      remapTab(oldId, newId);
      try {
        const tab = await browser.tabs.get(newId);
        metaFor(tab);
      } catch {
        // A replacement can itself close before we inspect it.
      }
      await save();
      queueReschedule();
    });
  });

  browser.windows.onFocusChanged.addListener((windowId) => {
    void enqueue(async () => {
      const now = Date.now();
      checkpointUsage(now);
      focusedWindowId = windowId;
      await currentFocusedTab(now);
      await save();
    });
  });

  browser.idle?.onStateChanged?.addListener((idleState) => {
    void enqueue(async () => {
      const now = Date.now();
      checkpointUsage(now);
      userActive = idleState !== "locked";
      await currentFocusedTab(now);
      await save();
    });
  });

  browser.permissions?.onRemoved?.addListener(() => {
    // Cached booleans no longer prove that content checks are available.
    safetyByTab.clear();
    queueReschedule();
  });

  // An alarm can be lost on browser restart. Rebuild it when the worker starts.
  void enqueue(async () => scheduleAlarm());
}
