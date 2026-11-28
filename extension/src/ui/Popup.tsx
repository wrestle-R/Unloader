import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { sendRequest } from "../shared/api";
import type { DashboardSnapshot, TabInfo, UnloadResult } from "../shared/types";
import { Icon } from "./Icons";
import { formatMemory } from "./utils";

async function openDashboard(section: "tabs" | "rules") {
  const base = browser.runtime.getURL("/dashboard.html");
  const target = `${base}#${section}`;
  const tabs = await browser.tabs.query({});
  const existing = tabs.find(tab => !tab.incognito && tab.url?.startsWith(base));
  if (existing?.id !== undefined) {
    await browser.tabs.update(existing.id, { active: true, ...(existing.url !== target ? { url: target } : {}) });
    await browser.windows.update(existing.windowId, { focused: true });
  } else {
    await browser.tabs.create({ url: target });
  }
  window.close();
}

export function Popup() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [current, setCurrent] = useState<TabInfo>();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([
      sendRequest<DashboardSnapshot>({ type: "getSnapshot" }),
      browser.tabs.query({ active: true, lastFocusedWindow: true }),
    ]).then(([data, [active]]) => {
      setSnapshot(data);
      setCurrent(data.tabs.find(tab => tab.id === active?.id && tab.hostname && !tab.discarded));
    }).catch(reason => setError(reason instanceof Error ? reason.message : "Could not load tabs."));
  }, []);

  const theme = snapshot?.settings.theme;
  useEffect(() => {
    if (!theme) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => { document.documentElement.dataset.theme = theme === "system" ? (media.matches ? "dark" : "light") : theme; };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  async function unloadCurrent(tab: TabInfo) {
    setError("");
    setBusy(true);
    try {
      const result = await sendRequest<UnloadResult>({ type: "unloadTab", tabId: tab.id, expectedUrl: tab.url });
      if (result.status === "blocked") throw new Error(result.message ?? "This tab could not be unloaded.");
      setCurrent(undefined);
      setNotice("Tab unloaded.");
      setSnapshot(await sendRequest<DashboardSnapshot>({ type: "getSnapshot" }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not unload this tab.");
    } finally {
      setBusy(false);
    }
  }

  const unloaded = snapshot?.tabs.filter(tab => tab.discarded).length ?? 0;
  return <main className="popup" data-testid="popup-app">
    <h1><img src="/icon/icon.svg" width={29} height={29} alt=""/>Unloader</h1>
    {current ? <div className="popup-current"><strong title={current.title}>{current.title}</strong><span>{current.hostname}</span></div> : null}
    {error ? <p className="popup-error" role="alert">{error}</p> : null}
    {notice ? <p className="popup-notice" role="status">{notice}</p> : null}
    <div className="popup-actions">
      {current ? <button className="popup-launch popup-primary" type="button" disabled={busy} onClick={() => void unloadCurrent(current)}><Icon name="power" size={17}/>{busy ? "Unloading…" : "Unload current tab"}</button> : null}
      {(["tabs", "rules"] as const).map(section =>
        <button key={section} className="popup-launch" type="button" onClick={() => void openDashboard(section).catch(reason => setError(reason instanceof Error ? reason.message : "Could not open dashboard."))}>
          {section === "tabs" ? "Manage tabs" : "Website rules"} <Icon name="arrow" size={16}/>
        </button>
      )}
    </div>
    <div className="popup-memory">
      <span>Estimated freed now</span>
      <strong>{snapshot ? formatMemory(snapshot.memory.currentEstimatedMiB) : "—"}</strong>
      {snapshot ? <small>{unloaded} unloaded {unloaded === 1 ? "tab" : "tabs"}</small> : null}
    </div>
    {snapshot?.shortcut ? <div className="popup-foot"><Icon name="keyboard" size={16}/><kbd>{snapshot.shortcut}</kbd></div> : null}
  </main>;
}
