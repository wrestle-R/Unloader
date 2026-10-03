import { useCallback, useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { sendRequest } from "../shared/api";
import type { BenchmarkReport, DashboardSnapshot, ExportedSettings, Settings, SiteRule, TabInfo, Theme, UnloadResult } from "../shared/types";
import { Icon, type IconName } from "./Icons";
import { ActivityPage, RulesPage, SettingsPage, StatisticsPage, UsagePage } from "./Pages";
import { TabList } from "./TabList";
import { parseBenchmarkReport, type UsageSort } from "./utils";

type Section = "tabs" | "rules" | "usage" | "stats" | "activity" | "settings";
const sectionNames: Record<Section, string> = {
  tabs: "Tabs", rules: "Website rules", usage: "Page usage", stats: "Extension statistics", activity: "Activity", settings: "Settings",
};
const navGroups: { title: string; items: { id: Section; icon: IconName }[] }[] = [
  { title: "WORKSPACE", items: [{ id: "tabs", icon: "layers" }, { id: "rules", icon: "shield" }, { id: "usage", icon: "chart" }] },
  { title: "INSIGHTS", items: [{ id: "stats", icon: "activity" }, { id: "activity", icon: "clock" }, { id: "settings", icon: "settings" }] },
];

function initialSection(): Section {
  const hash = window.location.hash.slice(1);
  return Object.prototype.hasOwnProperty.call(sectionNames, hash) ? hash as Section : "tabs";
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Dashboard() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [section, setSection] = useState<Section>(initialSection);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<UsageSort>("recent");
  const [usageSort, setUsageSort] = useState<UsageSort>("mostToday");
  const [notice, setNotice] = useState<{ text: string; kind: "success" | "error" } | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingTab, setPendingTab] = useState<{ tab: TabInfo; message: string } | null>(null);
  const [benchmarkReports, setBenchmarkReports] = useState<BenchmarkReport[]>([]);
  const [mobileNav, setMobileNav] = useState(false);
  const handledQuery = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await sendRequest<DashboardSnapshot>({ type: "getSnapshot" });
      setSnapshot(next);
      setFatal(null);
    } catch (error) {
      setFatal(error instanceof Error ? error.message : "Could not reach the extension background process.");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { void refresh(); }, 180);
    };
    browser.tabs.onCreated.addListener(schedule);
    browser.tabs.onRemoved.addListener(schedule);
    browser.tabs.onUpdated.addListener(schedule);
    browser.tabs.onActivated.addListener(schedule);
    browser.windows.onFocusChanged.addListener(schedule);
    window.addEventListener("focus", schedule);
    return () => {
      window.clearTimeout(timer);
      browser.tabs.onCreated.removeListener(schedule);
      browser.tabs.onRemoved.removeListener(schedule);
      browser.tabs.onUpdated.removeListener(schedule);
      browser.tabs.onActivated.removeListener(schedule);
      browser.windows.onFocusChanged.removeListener(schedule);
      window.removeEventListener("focus", schedule);
    };
  }, [refresh]);

  useEffect(() => {
    void browser.storage.local.get("benchmarkReports").then(value => {
      const entries = value.benchmarkReports;
      if (Array.isArray(entries)) setBenchmarkReports(entries.flatMap(entry => {
        try { return [parseBenchmarkReport(entry)]; } catch { return []; }
      }).slice(0, 20));
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme = snapshot.settings.theme === "system" ? (media.matches ? "dark" : "light") : snapshot.settings.theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [snapshot?.settings.theme]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const syncHash = () => setSection(initialSection());
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    if (section !== "tabs") return;
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey ||
          (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)))) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [section]);

  const showError = (error: unknown) => setNotice({ text: error instanceof Error ? error.message : "Something went wrong.", kind: "error" });
  const showSuccess = (text: string) => setNotice({ text, kind: "success" });

  async function runMutation(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      await refresh();
      showSuccess(success);
    } catch (error) { showError(error); }
    finally { setBusy(false); }
  }

  async function unload(tab: TabInfo, force = false) {
    setBusy(true);
    try {
      const result = await sendRequest<UnloadResult>({ type: "unloadTab", tabId: tab.id, force, ...(force ? { expectedUrl: tab.url } : {}) });
      if (result.status === "needs_confirmation") setPendingTab({ tab, message: result.message ?? "This page may have work in progress." });
      else if (result.status === "blocked") showError(result.message ?? "This tab cannot be unloaded.");
      else { setPendingTab(null); showSuccess("Tab unloaded. It stays in your browser and reloads when opened."); }
      await refresh();
    } catch (error) { showError(error); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!snapshot || handledQuery.current) return;
    const id = Number(new URLSearchParams(window.location.search).get("confirmTab"));
    if (!Number.isInteger(id) || id <= 0) return;
    handledQuery.current = true;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
    const tab = snapshot.tabs.find(item => item.id === id);
    if (tab) void unload(tab);
  }, [snapshot]);

  const activeCount = snapshot?.tabs.filter(tab => !tab.discarded).length ?? 0;
  const unloadedCount = snapshot?.tabs.filter(tab => tab.discarded).length ?? 0;
  const rulesCount = Object.keys(snapshot?.settings.siteRules ?? {}).length;
  const changeSection = (id: Section) => { setSection(id); window.location.hash = id; setMobileNav(false); };

  return <div className="dashboard" data-testid="dashboard-app">
    <aside className={`sidebar ${mobileNav ? "open" : ""}`} aria-label="Primary navigation">
      <div className="brand-lockup"><div className="brand-mark"><Icon name="layers" size={23}/></div><div><div className="brand-name">unloader<span>.</span></div><div className="brand-sub">A calmer browser</div></div></div>
      <div className="sidebar-rule" />
      <nav>
        {navGroups.map(group => <div className="nav-group" key={group.title}><div className="nav-label">{group.title}</div>{group.items.map(item => <button key={item.id} className={`nav-item ${section === item.id ? "active" : ""}`} type="button" onClick={() => changeSection(item.id)} aria-current={section === item.id ? "page" : undefined} data-testid={`nav-${item.id}`}><Icon name={item.icon} size={18}/><span>{sectionNames[item.id]}</span>{item.id === "tabs" && snapshot ? <b>{snapshot.tabs.length}</b> : null}</button>)}</div>)}
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-status"><span className="live-dot"/><span>Working locally</span></div><p>Thoughtful tab care, right in your browser.</p></div>
    </aside>
    {mobileNav ? <button className="nav-scrim" type="button" aria-label="Close navigation" onClick={() => setMobileNav(false)}/> : null}
    <main className="main-panel">
      <header className="topbar"><button className="mobile-menu icon-button" type="button" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Icon name="menu"/></button><div className="breadcrumb"><span>UNLOADER</span><span className="breadcrumb-slash">/</span><strong>{sectionNames[section]}</strong></div><div className="topbar-right"><span className="topbar-caption">YOUR BROWSER, IN BALANCE</span><button type="button" className="icon-button refresh-button" onClick={() => void refresh()} aria-label="Refresh dashboard" title="Refresh"><Icon name="refresh" size={17}/></button></div></header>
      <div className="content">
        {fatal && !snapshot ? <div className="fatal-panel"><Icon name="warning" size={30}/><h2>Could not load Unloader</h2><p>{fatal}</p><button className="button primary" onClick={() => void refresh()}>Try again</button></div> : null}
        {!snapshot && !fatal ? <div className="loading-state"><div className="loading-ring"/><span>Getting your tabs ready…</span></div> : null}
        {snapshot ? <>
          {section === "tabs" ? <>
            <div className="page-heading"><div className="eyebrow"><span className="eyebrow-line"/> YOUR SPACE</div><h1>Your tabs, <em>in balance.</em></h1><p>See what is open, keep what matters, and give everything else room to rest.</p></div>
            <div className="overview-grid"><div className="overview-card primary-overview"><div className="overview-icon"><Icon name="layers"/></div><div className="overview-label">OPEN TABS</div><div className="overview-number">{snapshot.tabs.length.toString().padStart(2, "0")}</div><div className="overview-foot">Across your browser windows <Icon name="arrow" size={16}/></div></div><div className="overview-card"><div className="overview-icon soft"><Icon name="sun"/></div><div className="overview-label">LOADED</div><div className="overview-number">{activeCount.toString().padStart(2, "0")}</div><div className="overview-foot muted">Ready whenever you need them</div></div><div className="overview-card"><div className="overview-icon soft"><Icon name="moon"/></div><div className="overview-label">UNLOADED</div><div className="overview-number">{unloadedCount.toString().padStart(2, "0")}</div><div className="overview-foot muted">Still in your tab bar</div></div></div>
            <div className="section-heading"><div><span className="section-kicker">01 / TAB MANAGEMENT</span><h2>All your tabs <span className="count-badge">{snapshot.tabs.length}</span></h2></div><span className="section-help">Unloading keeps a tab in place and reloads it on return.</span></div>
            <div className="panel list-panel"><div className="list-toolbar"><label className="search-field"><Icon name="search" size={18}/><input ref={searchRef} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search pages or websites" aria-label="Search tabs"/><kbd>/</kbd></label><label className="select-wrap"><span>Sort</span><select value={sort} onChange={event => setSort(event.target.value as UsageSort)} aria-label="Sort tabs"><option value="recent">Recently used</option><option value="title">Page title</option><option value="mostToday">Most used today</option><option value="leastToday">Least used today</option><option value="mostWeek">Most used, 7 days</option><option value="leastWeek">Least used, 7 days</option></select><Icon name="chevron" size={15}/></label></div><TabList key={`${search}-${sort}`} tabs={snapshot.tabs} search={search} sort={sort} onUnload={tab => void unload(tab)} onRestore={tab => void runMutation(() => sendRequest<boolean>({ type: "restoreTab", tabId: tab.id }), "Tab restored.")} /></div>
          </> : null}
          {section === "rules" ? <RulesPage settings={snapshot.settings} rulesCount={rulesCount} busy={busy} onGlobal={minutes => void runMutation(() => sendRequest<Settings>({ type: "setGlobalMinutes", minutes }), minutes === null ? "Automatic unloading turned off." : "Idle timer updated.")} onRule={(hostname, rule) => void runMutation(() => sendRequest<Settings>({ type: "setRule", hostname, rule }), rule ? "Website rule saved." : "Website rule removed.")} onError={showError}/> : null}
          {section === "usage" ? <UsagePage tabs={snapshot.tabs} search={search} setSearch={setSearch} sort={usageSort} setSort={setUsageSort} onUnload={tab => void unload(tab)} onRestore={tab => void runMutation(() => sendRequest<boolean>({ type: "restoreTab", tabId: tab.id }), "Tab restored.")}/> : null}
          {section === "stats" ? <StatisticsPage snapshot={snapshot} reports={benchmarkReports} setReports={setBenchmarkReports} onError={showError} onSuccess={showSuccess}/> : null}
          {section === "activity" ? <ActivityPage activity={snapshot.activity} onClear={() => void runMutation(() => sendRequest<boolean>({ type: "clearActivity" }), "Activity cleared.")} /> : null}
          {section === "settings" ? <SettingsPage settings={snapshot.settings} shortcut={snapshot.shortcut} onTheme={(theme: Theme) => void runMutation(() => sendRequest<Settings>({ type: "setTheme", theme }), "Appearance updated.")} onExport={() => void sendRequest<ExportedSettings>({ type: "exportSettings" }).then(value => { downloadJson("unloader-settings.json", value); showSuccess("Settings exported."); }).catch(showError)} onImport={value => void runMutation(() => sendRequest<Settings>({ type: "importSettings", value }), "Settings imported.")} onError={showError} /> : null}
        </> : null}
      </div>
    </main>
    {notice ? <div className={`toast ${notice.kind}`} role="status"><Icon name={notice.kind === "success" ? "check" : "warning"} size={18}/><span>{notice.text}</span><button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice"><Icon name="close" size={16}/></button></div> : null}
    {pendingTab ? <ConfirmDialog tab={pendingTab.tab} message={pendingTab.message} busy={busy} onCancel={() => setPendingTab(null)} onConfirm={() => void unload(pendingTab.tab, true)}/> : null}
  </div>;
}

function ConfirmDialog({ tab, message, busy, onCancel, onConfirm }: { tab: TabInfo; message: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
      if (event.key !== "Tab") return;
      const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])];
      if (!buttons.length) return;
      const current = document.activeElement;
      if (event.shiftKey && current === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1]?.focus(); }
      else if (!event.shiftKey && current === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0]?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}><div ref={dialogRef} className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-desc"><div className="dialog-symbol"><Icon name="warning" size={24}/></div><h2 id="confirm-title">Unload this tab?</h2><p id="confirm-desc">{message} Unloading <strong>{tab.title || tab.hostname || "this page"}</strong> may interrupt it. Continue only if you are ready to reload the page later.</p><div className="dialog-actions"><button ref={cancelRef} className="button secondary" type="button" onClick={onCancel}>Keep loaded</button><button className="button primary" type="button" disabled={busy} onClick={onConfirm}>Unload anyway</button></div></div></div>;
}
