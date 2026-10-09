import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { sendRequest } from "../shared/api";
import type { DashboardSnapshot } from "../shared/types";
import { Icon } from "./Icons";

async function openDashboard() {
  const target = browser.runtime.getURL("/dashboard.html");
  const tabs = await browser.tabs.query({});
  const existing = tabs.find(tab => tab.url?.startsWith(target));
  if (existing?.id !== undefined) {
    await browser.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) await browser.windows.update(existing.windowId, { focused: true });
  } else {
    await browser.tabs.create({ url: target });
  }
  window.close();
}

export function Popup() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void sendRequest<DashboardSnapshot>({ type: "getSnapshot" }).then(setSnapshot).catch(reason => setError(reason instanceof Error ? reason.message : "Could not load tabs."));
  }, []);
  useEffect(() => {
    if (!snapshot) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => { document.documentElement.dataset.theme = snapshot.settings.theme === "system" ? (media.matches ? "dark" : "light") : snapshot.settings.theme; };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [snapshot?.settings.theme]);
  const loaded = snapshot?.tabs.filter(tab => !tab.discarded).length ?? 0;
  const unloaded = snapshot?.tabs.filter(tab => tab.discarded).length ?? 0;
  const formatMemory = (mib: number) => mib >= 1024 ? `${(mib / 1024).toFixed(1)} GiB` : `${Math.round(mib)} MiB`;
  return <div className="popup" data-testid="popup-app">
    <div className="popup-top"><div className="popup-brand"><span className="popup-logo"><Icon name="layers" size={19}/></span><span>Unloader</span></div><span className="popup-live"><span/>LOCAL</span></div>
    <div className="popup-hero"><h1>Keep your tabs. Free up some room.</h1><p>Unloaded pages stay in your tab bar and reload when you open them.</p></div>
    <div className="popup-memory"><span>Estimated freed now</span><strong>{snapshot ? formatMemory(snapshot.memory.currentEstimatedMiB) : "—"}</strong><small>Based on typical site memory use</small></div>
    <div className="popup-metrics"><div><strong>{snapshot ? loaded : "—"}</strong><span>loaded</span></div><div><strong>{snapshot ? unloaded : "—"}</strong><span>unloaded</span></div></div>
    {error ? <p className="popup-error" role="alert">{error}</p> : null}
    <button className="popup-launch" type="button" onClick={() => void openDashboard().catch(reason => setError(reason instanceof Error ? reason.message : "Could not open dashboard."))}>Manage tabs <Icon name="arrow" size={19}/></button>
    <div className="popup-foot"><Icon name="keyboard" size={15}/><span>{snapshot?.shortcut ? `${snapshot.shortcut} to unload this tab` : "Set a shortcut in your browser’s extension settings"}</span></div>
  </div>;
}
