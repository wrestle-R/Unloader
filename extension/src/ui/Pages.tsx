import { useEffect, useRef, useState } from "react";
import type { ActivityEntry, Settings, SiteRule, Theme } from "../shared/types";
import { Icon } from "./Icons";
import { describeRule, formatTime } from "./utils";

function PageHeading({ eyebrow, title, italic, description }: { eyebrow: string; title: string; italic: string; description: string }) {
  return <div className="page-heading"><span className="sr-only">{eyebrow}</span><h1>{title} <em>{italic}</em></h1><p>{description}</p></div>;
}

function normalizedHost(input: string): string {
  const value = input.trim().toLowerCase();
  if (!value) throw new Error("Enter a website hostname first.");
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  if (!url.hostname || !/^[a-z0-9.-]+$/.test(url.hostname) || url.hostname.startsWith(".") || url.hostname.endsWith(".")) throw new Error("Enter a valid hostname, such as web.whatsapp.com.");
  return url.hostname;
}

export function RulesPage({ settings, rulesCount, busy, onGlobal, onRule, onError }: {
  settings: Settings; rulesCount: number; busy: boolean; onGlobal: (minutes: number | null) => void; onRule: (host: string, rule: SiteRule | null) => void; onError: (error: unknown) => void;
}) {
  const [globalDraft, setGlobalDraft] = useState(settings.globalIdleMinutes ?? 15);
  const [hostname, setHostname] = useState("");
  const [newMode, setNewMode] = useState<SiteRule["mode"]>("awake");
  const [newMinutes, setNewMinutes] = useState(15);
  useEffect(() => setGlobalDraft(settings.globalIdleMinutes ?? 15), [settings.globalIdleMinutes]);
  const ruleRows = Object.entries(settings.siteRules).sort(([a], [b]) => a.localeCompare(b));

  function addRule(event: React.FormEvent) {
    event.preventDefault();
    try {
      const host = normalizedHost(hostname);
      if (newMode === "timed" && (!Number.isInteger(newMinutes) || newMinutes < 1 || newMinutes > 1440)) throw new Error("A timer must be between 1 and 1,440 minutes.");
      onRule(host, newMode === "timed" ? { mode: "timed", minutes: newMinutes } : { mode: newMode });
      setHostname("");
    } catch (error) { onError(error); }
  }

  return <div data-testid="rules-page"><PageHeading eyebrow="02 / PREFERENCES" title="Website rules" italic="" description="Choose which sites rest, which stay ready, and when automatic unloading begins."/>
    <div className="feature-card"><div className="feature-copy"><span className="feature-overline"><Icon name="clock" size={15}/> DEFAULT BEHAVIOR</span><h2>{settings.globalIdleMinutes === null ? "You decide when tabs rest." : "Let quiet tabs rest on their own."}</h2><p>{settings.globalIdleMinutes === null ? "Automatic unloading is off. Use the tab list or Ctrl+Shift+U to unload a page yourself." : "Eligible tabs unload after the idle time below. Active, pinned, editing, and media tabs are protected."}</p></div><div className="timer-controls"><label className="toggle-row"><span>Automatic unloading</span><input type="checkbox" checked={settings.globalIdleMinutes !== null} disabled={busy} onChange={event => { if (!event.target.checked) onGlobal(null); else if (Number.isInteger(globalDraft) && globalDraft >= 1 && globalDraft <= 1440) onGlobal(globalDraft); else { setGlobalDraft(15); onError(new Error("Choose 1 to 1,440 minutes.")); } }} /><span className="toggle-track" aria-hidden="true"/></label><div className="timer-input-wrap"><input type="number" min="1" max="1440" step="1" value={globalDraft} disabled={busy || settings.globalIdleMinutes === null} onChange={event => setGlobalDraft(Number(event.target.value))} onBlur={() => { if (settings.globalIdleMinutes === null) return; if (!Number.isInteger(globalDraft) || globalDraft < 1 || globalDraft > 1440) { setGlobalDraft(settings.globalIdleMinutes); onError(new Error("Choose 1 to 1,440 minutes.")); } else if (globalDraft !== settings.globalIdleMinutes) onGlobal(globalDraft); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} aria-label="Default idle minutes"/><span>minutes of inactivity</span></div></div></div>
    <div className="section-heading lower"><div><span className="section-kicker">PERSONAL EXCEPTIONS</span><h2>Website rules <span className="count-badge">{rulesCount}</span></h2></div><span className="section-help">Rules apply to the exact website hostname.</span></div>
    <div className="panel rules-panel"><form className="add-rule-form" onSubmit={addRule}><label className="host-field"><Icon name="globe" size={18}/><input value={hostname} onChange={event => setHostname(event.target.value)} placeholder="e.g. web.whatsapp.com" aria-label="Website hostname"/></label><label className="select-wrap mode-select"><span className="sr-only">Rule type</span><select value={newMode} onChange={event => setNewMode(event.target.value as SiteRule["mode"])} aria-label="New website rule"><option value="awake">Keep awake</option><option value="manual">Manual only</option><option value="timed">Custom timer</option></select><Icon name="chevron" size={15}/></label>{newMode === "timed" ? <label className="mini-number"><input type="number" min="1" max="1440" value={newMinutes} onChange={event => setNewMinutes(Number(event.target.value))} aria-label="Custom idle minutes"/><span>min</span></label> : null}<button className="button primary add-rule-button" type="submit" disabled={busy}><Icon name="plus" size={17}/>Add rule</button></form>
      {ruleRows.length ? <div className="rules-list">{ruleRows.map(([host, rule]) => <RuleRow key={host} host={host} rule={rule} busy={busy} onRule={onRule} onError={onError}/>)}</div> : <div className="rule-empty"><div className="rule-empty-symbol"><Icon name="shield" size={24}/></div><div><h3>No website rules yet</h3><p>Keep a messaging app ready by adding its website above.</p></div>{!settings.siteRules["web.whatsapp.com"] ? <button type="button" className="text-button" onClick={() => onRule("web.whatsapp.com", { mode: "awake" })}>Keep WhatsApp awake <Icon name="arrow" size={16}/></button> : null}</div>}</div>
    <div className="hint-strip"><Icon name="info" size={18}/><p><strong>Keep awake</strong> prevents automatic unloading. You can still unload that tab yourself, and the rule remains in place when it reopens.</p></div>
  </div>;
}

function RuleRow({ host, rule, busy, onRule, onError }: { host: string; rule: SiteRule; busy: boolean; onRule: (host: string, rule: SiteRule | null) => void; onError: (error: unknown) => void }) {
  const [minutes, setMinutes] = useState(rule.mode === "timed" ? rule.minutes : 15);
  useEffect(() => setMinutes(rule.mode === "timed" ? rule.minutes : 15), [rule]);
  return <div className="rule-row"><span className="rule-site-icon"><Icon name="globe" size={18}/></span><div className="rule-site"><strong>{host}</strong><span>{describeRule(rule)}</span></div><label className="select-wrap mode-select"><span className="sr-only">Rule for {host}</span><select value={rule.mode} disabled={busy} onChange={event => { const mode = event.target.value; onRule(host, mode === "default" ? null : mode === "timed" ? { mode, minutes: 15 } : { mode: mode as "awake" | "manual" }); }} aria-label={`Rule for ${host}`}><option value="default">Follow default</option><option value="awake">Keep awake</option><option value="manual">Manual only</option><option value="timed">Custom timer</option></select><Icon name="chevron" size={15}/></label>{rule.mode === "timed" ? <label className="mini-number"><input type="number" min="1" max="1440" value={minutes} disabled={busy} onChange={event => setMinutes(Number(event.target.value))} onBlur={() => { if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) { setMinutes(rule.minutes); onError(new Error("Choose 1 to 1,440 minutes.")); } else if (minutes !== rule.minutes) onRule(host, { mode: "timed", minutes }); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} aria-label={`Idle minutes for ${host}`}/><span>min</span></label> : null}<button className="rule-remove icon-button" type="button" disabled={busy} onClick={() => onRule(host, null)} title={`Remove ${host} rule`} aria-label={`Remove ${host} rule`}><Icon name="trash" size={17}/></button></div>;
}

export function ActivityPage({ activity, onClear }: { activity: ActivityEntry[]; onClear: () => void }) {
  return <div><PageHeading eyebrow="05 / ACTIVITY" title="Activity" italic="" description="Your recent unloads and restores, kept locally so you can see what happened."/><div className="section-heading lower"><div><span className="section-kicker">RECENT EVENTS</span><h2>Activity <span className="count-badge">{activity.length}</span></h2></div>{activity.length ? <button className="button secondary" type="button" onClick={onClear}><Icon name="trash" size={16}/>Clear history</button> : null}</div><div className="panel activity-panel">{activity.length ? activity.map(entry => <div className="activity-row" key={entry.id}><span className={`activity-symbol ${entry.action}`}><Icon name={entry.action === "unload" ? "moon" : entry.action === "restore" ? "play" : "warning"} size={18}/></span><div><strong>{entry.action === "unload" ? "Tab unloaded" : entry.action === "restore" ? "Tab restored" : "Unload skipped"}</strong><span>{entry.hostname || "Browser page"} · {entry.reason}</span></div><time dateTime={new Date(entry.at).toISOString()}>{formatTime(entry.at)}</time></div>) : <div className="empty-state"><span className="empty-icon"><Icon name="activity" size={25}/></span><h3>Nothing to report yet</h3><p>Unloads and restores will show up here. The latest 100 events stay in this browser.</p></div>}</div></div>;
}

export function SettingsPage({ settings, shortcut, onTheme, onExport, onImport, onError }: { settings: Settings; shortcut: string | null; onTheme: (theme: Theme) => void; onExport: () => void; onImport: (value: unknown) => void; onError: (error: unknown) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isFirefox = /Firefox|Zen/i.test(navigator.userAgent);
  async function importSettings(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error("Choose a settings file smaller than 1 MB.");
      onImport(JSON.parse(await file.text()));
    } catch (error) { onError(error); }
    if (inputRef.current) inputRef.current.value = "";
  }
  return <div><PageHeading eyebrow="06 / SETTINGS" title="Settings" italic="" description="Adjust the look, take your rules with you, and check your keyboard shortcut."/>
    <div className="settings-grid"><section className="panel settings-section"><div className="setting-icon"><Icon name="sun" size={20}/></div><h2>Appearance</h2><p>Follow your browser, or settle into the theme that feels right.</p><div className="theme-options" role="group" aria-label="Appearance"><ThemeButton theme="system" selected={settings.theme === "system"} onClick={onTheme}/><ThemeButton theme="light" selected={settings.theme === "light"} onClick={onTheme}/><ThemeButton theme="dark" selected={settings.theme === "dark"} onClick={onTheme}/></div></section><section className="panel settings-section"><div className="setting-icon"><Icon name="keyboard" size={20}/></div><h2>Quick unload</h2><p>Unload the current page while keeping its tab in your browser.</p><div className="shortcut-display"><span>KEYBOARD SHORTCUT</span>{shortcut ? <kbd>{shortcut}</kbd> : <strong>Not assigned</strong>}</div><p className="setting-hint">{shortcut ? "Try the shown shortcut once. A browser can intercept an assigned key combination; remap it if the extension does not respond." : "Ctrl+Shift+U is not assigned. Choose a free key combination in extension shortcuts."} {isFirefox ? "In Firefox or Zen, open Add-ons Manager → Extensions → Manage Extension Shortcuts." : "In Chrome or Brave, open chrome://extensions/shortcuts."} You can always unload a page from the Tabs screen.</p></section></div>
    <div className="section-heading lower"><div><span className="section-kicker">YOUR DATA</span><h2>Move your settings</h2></div></div><div className="panel data-panel"><div><h3>Keep a copy of your rules</h3><p>Export or import your website rules, timer, and appearance as a JSON file. These stay in your browser unless you export them.</p></div><div className="data-actions"><button className="button secondary" type="button" onClick={onExport}><Icon name="download" size={17}/>Export settings</button><button className="button primary" type="button" onClick={() => inputRef.current?.click()}><Icon name="upload" size={17}/>Import settings</button><input ref={inputRef} className="sr-only" type="file" accept="application/json,.json" aria-label="Import settings file" onChange={event => void importSettings(event.target.files?.[0])}/></div></div>
  </div>;
}

function ThemeButton({ theme, selected, onClick }: { theme: Theme; selected: boolean; onClick: (theme: Theme) => void }) {
  return <button type="button" className={`theme-option ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={() => onClick(theme)}><span className={`theme-preview ${theme}`}><span/><span/><span/></span><span className="theme-option-bottom"><span>{theme === "system" ? "System" : theme === "light" ? "Light" : "Dark"}</span>{selected ? <Icon name="check" size={15}/> : null}</span></button>;
}
