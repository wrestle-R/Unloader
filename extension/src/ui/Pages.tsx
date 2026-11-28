import { useEffect, useRef, useState, type FormEvent } from "react";
import { normalizeHostname, validMinutes } from "../background/policy";
import type { ActivityEntry, Settings, SiteRule, Theme } from "../shared/types";
import { Icon } from "./Icons";
import { describeRule, formatTime } from "./utils";

function PageHeading({ title, description }: { title: string; description: string }) {
  return <div className="page-heading"><h1>{title}</h1><p>{description}</p></div>;
}

function hostnameForRule(input: string): string {
  const value = input.trim();
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    const hostname = normalizeHostname(url.hostname);
    if (hostname && ["https:", "http:"].includes(url.protocol)) return hostname;
  } catch {
    // Give the same field guidance for malformed URLs and unsupported hostnames.
  }
  throw new Error("Enter a hostname or website URL, such as web.whatsapp.com.");
}

const ruleLabels = {
  awake: "Keep awake",
  manual: "Manual only",
  timed: "Custom timer",
} as const;

const minuteError = "Choose a whole number from 1 to 1,440 minutes.";

interface RulesProps {
  settings: Settings;
  busy: boolean;
  onGlobal: (minutes: number | null) => Promise<boolean>;
  onRule: (host: string, rule: SiteRule | null) => Promise<boolean>;
  onError: (error: unknown) => void;
}

export function RulesPage({ settings, busy, onGlobal, onRule, onError }: RulesProps) {
  const automatic = settings.globalIdleMinutes !== null;
  const [globalDraft, setGlobalDraft] = useState(String(settings.globalIdleMinutes ?? 15));
  const [editingHost, setEditingHost] = useState<string | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const rules = Object.entries(settings.siteRules).sort(([a], [b]) => a.localeCompare(b));

  useEffect(() => {
    if (settings.globalIdleMinutes !== null) setGlobalDraft(String(settings.globalIdleMinutes));
  }, [settings.globalIdleMinutes]);

  function saveDefault(event: FormEvent) {
    event.preventDefault();
    if (!validMinutes(Number(globalDraft))) return onError(new Error(minuteError));
    void onGlobal(Number(globalDraft));
  }

  return <div className="rules-page" data-testid="rules-page">
    <PageHeading title="Website rules" description="Set the default idle timer and choose which sites need a different rule."/>

    <section className="panel default-rule" aria-labelledby="default-rule-title">
      <div className="default-rule-header">
        <span className="section-icon"><Icon name="clock" size={22}/></span>
        <div>
          <h2 id="default-rule-title">Automatic unloading</h2>
          <p>{automatic ? "Unload eligible tabs after they’ve been idle." : "The default idle timer is off. Custom site timers can still run."}</p>
        </div>
        <label className="switch">
          <input type="checkbox" role="switch" checked={automatic} disabled={busy} aria-label="Automatic unloading" onChange={event => {
            const minutes = Number(globalDraft);
            void onGlobal(event.target.checked ? (validMinutes(minutes) ? minutes : 15) : null);
          }}/>
          <span aria-hidden="true"/>
        </label>
      </div>
      {automatic ? <form className="default-form" onSubmit={saveDefault}>
        <label className="field"><span>Unload after</span>
          <span className="number-control"><input type="number" min="1" max="1440" required value={globalDraft} disabled={busy} onChange={event => setGlobalDraft(event.target.value)} aria-label="Default idle minutes"/><span>minutes</span></span>
        </label>
        <button type="submit" className="button secondary" disabled={busy || Number(globalDraft) === settings.globalIdleMinutes}>Save timer</button>
      </form> : null}
    </section>

    <section className="rules-section" aria-labelledby="site-exceptions-title">
      <div className="section-heading">
        <div><h2 id="site-exceptions-title">Site exceptions</h2><p>Rules match the exact hostname you enter.</p></div>
        <button ref={addButton} className="button primary" type="button" disabled={busy} aria-expanded={editingHost === ""} onClick={() => setEditingHost("")}><Icon name="plus" size={17}/>Add rule</button>
      </div>
      <div className="panel rules-panel">
        {editingHost === "" ? <RuleEditor key="new" busy={busy} onRule={onRule} onError={onError} onExistingHost={hostname => {
          if (!Object.hasOwn(settings.siteRules, hostname)) return false;
          setEditingHost(hostname);
          return true;
        }} onClose={() => {
          setEditingHost(null);
          requestAnimationFrame(() => addButton.current?.focus());
        }}/> : null}
        {rules.length ? <ul className="rules-list">{rules.map(([host, rule]) => <li className="saved-rule" key={host}>
          <div className="rule-row">
            <span className="rule-site-icon"><Icon name="globe" size={18}/></span>
            <div className="rule-site"><strong>{host}</strong><span>{describeRule(rule)}</span></div>
            <button id={`edit-rule-${host}`} className="button secondary" type="button" disabled={busy} aria-label={`Edit rule for ${host}`} aria-expanded={editingHost === host} onClick={() => setEditingHost(host)}>Edit</button>
          </div>
          {editingHost === host ? <RuleEditor host={host} rule={rule} busy={busy} onRule={onRule} onError={onError} onClose={(removed) => {
            setEditingHost(null);
            if (removed) requestAnimationFrame(() => addButton.current?.focus());
            else requestAnimationFrame(() => document.getElementById(`edit-rule-${host}`)?.focus());
          }}/> : null}
        </li>)}</ul>
          : editingHost !== "" ? <p className="rule-empty">No site exceptions yet. Sites follow the default timer.</p> : null}
      </div>
    </section>
  </div>;
}

const modeHelp: Record<SiteRule["mode"], string> = {
  awake: "Keep this site loaded automatically. You can still unload it yourself.",
  manual: "Unloader skips the idle timer for this site.",
  timed: "Unload this site after its own idle time.",
};

function RuleEditor({ host, rule, busy, onRule, onError, onClose, onExistingHost }: Pick<RulesProps, "busy" | "onRule" | "onError"> & {
  host?: string;
  rule?: SiteRule;
  onClose: (removed?: boolean) => void;
  onExistingHost?: (hostname: string) => boolean;
}) {
  const [website, setWebsite] = useState("");
  const [mode, setMode] = useState<SiteRule["mode"]>(rule?.mode ?? "awake");
  const [minutes, setMinutes] = useState(String(rule?.mode === "timed" ? rule.minutes : 15));
  const target = useRef<HTMLInputElement>(null);
  const modeField = useRef<HTMLSelectElement>(null);
  useEffect(() => (target.current ?? modeField.current)?.focus(), []);

  async function saveRule(event: FormEvent) {
    event.preventDefault();
    try {
      const hostname = host ?? hostnameForRule(website);
      if (onExistingHost?.(hostname)) return;
      const delay = Number(minutes);
      if (mode === "timed" && !validMinutes(delay)) throw new Error(minuteError);
      const next: SiteRule = mode === "timed" ? { mode, minutes: delay } : { mode };
      if (await onRule(hostname, next)) onClose();
    } catch (error) {
      onError(error);
    }
  }

  return <form className="rule-editor" onSubmit={saveRule}>
    <div className="rule-fields">
      {!host ? <label className="field host-field"><span>Website</span>
        <input ref={target} required value={website} onChange={event => setWebsite(event.target.value)} placeholder="e.g. web.whatsapp.com" aria-label="Website hostname" autoCapitalize="none" autoCorrect="off" spellCheck={false}/>
      </label> : null}
      <label className="field"><span>When to unload</span>
        <span className="select-wrap"><select ref={modeField} value={mode} onChange={event => setMode(event.target.value as SiteRule["mode"])} aria-label={host ? `Rule for ${host}` : "New website rule"}>
          {Object.entries(ruleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select><Icon name="chevron" size={15}/></span>
      </label>
      {mode === "timed" ? <label className="field"><span>Idle time</span>
        <span className="number-control"><input type="number" min="1" max="1440" required value={minutes} onChange={event => setMinutes(event.target.value)} aria-label={host ? `Idle minutes for ${host}` : "Custom idle minutes"}/><span>min</span></span>
      </label> : null}
    </div>
    <p className="rule-mode-help">{modeHelp[mode]}</p>
    <div className="rule-actions">
      {host ? <button className="button rule-remove" type="button" disabled={busy} onClick={async () => { if (await onRule(host, null)) onClose(true); }}><Icon name="trash" size={16}/>Remove rule</button> : null}
      <button className="button secondary" type="button" disabled={busy} onClick={() => onClose()}>Cancel</button>
      <button className="button primary" type="submit" disabled={busy}>Save rule</button>
    </div>
  </form>;
}

export function ActivityPage({ activity, onClear }: { activity: ActivityEntry[]; onClear: () => void }) {
  return <div><PageHeading title="Activity" description="Recent unloads and restores on this device."/><div className="section-heading lower"><h2>Recent events</h2>{activity.length ? <button className="button secondary" type="button" onClick={onClear}><Icon name="trash" size={16}/>Clear history</button> : null}</div><div className="panel activity-panel">{activity.length ? activity.map(entry => <div className="activity-row" key={entry.id}><span className={`activity-symbol ${entry.action}`}><Icon name={entry.action === "unload" ? "moon" : entry.action === "restore" ? "play" : "warning"} size={18}/></span><div><strong>{entry.action === "unload" ? "Tab unloaded" : entry.action === "restore" ? "Tab restored" : "Unload skipped"}</strong><span>{entry.hostname || "Browser page"} · {entry.reason}</span></div><time dateTime={new Date(entry.at).toISOString()}>{formatTime(entry.at)}</time></div>) : <div className="empty-state"><span className="empty-icon"><Icon name="activity" size={25}/></span><h3>Nothing to report yet</h3><p>Unloads and restores will show up here. The latest 100 events stay in this browser.</p></div>}</div></div>;
}

export function SettingsPage({ settings, shortcut, onTheme, onShortcut, onExport, onImport, onError }: { settings: Settings; shortcut: string | null; onTheme: (theme: Theme) => void; onShortcut: () => void; onExport: () => void; onImport: (value: unknown) => void; onError: (error: unknown) => void }) {
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
  return <div><PageHeading title="Settings" description="Change the theme, keyboard shortcut, or back up your rules."/>
    <div className="settings-grid"><section className="panel settings-section"><div className="setting-icon"><Icon name="sun" size={20}/></div><h2>Appearance</h2><p>Follow your browser, or settle into the theme that feels right.</p><div className="theme-options" role="group" aria-label="Appearance"><ThemeButton theme="system" selected={settings.theme === "system"} onClick={onTheme}/><ThemeButton theme="light" selected={settings.theme === "light"} onClick={onTheme}/><ThemeButton theme="dark" selected={settings.theme === "dark"} onClick={onTheme}/></div></section><section className="panel settings-section shortcut-section"><div className="setting-icon"><Icon name="keyboard" size={20}/></div><h2>Quick unload</h2><p>Unload the current page while keeping its tab in your browser.</p><div className="shortcut-display"><span>KEYBOARD SHORTCUT</span>{shortcut ? <kbd>{shortcut}</kbd> : <strong>Not assigned</strong>}</div><button className="button primary shortcut-button" type="button" onClick={onShortcut}><Icon name="settings" size={17}/>Customize shortcut</button><p className="setting-hint">{shortcut ? "The browser controls extension shortcuts and can intercept a key combination." : "Choose a free key combination in your browser’s extension shortcuts."} {isFirefox ? "In Firefox or Zen, use Manage Extension Shortcuts from Add-ons Manager." : "In Chrome or Brave, use chrome://extensions/shortcuts."} You can always unload a page from Tabs.</p></section></div>
    <div className="section-heading lower"><h2>Move your settings</h2></div><div className="panel data-panel"><div><h3>Keep a copy of your rules</h3><p>Export or import your website rules, timer, and appearance as a JSON file. These stay in your browser unless you export them.</p></div><div className="data-actions"><button className="button secondary" type="button" onClick={onExport}><Icon name="download" size={17}/>Export settings</button><button className="button primary" type="button" onClick={() => inputRef.current?.click()}><Icon name="upload" size={17}/>Import settings</button><input ref={inputRef} className="sr-only" type="file" accept="application/json,.json" aria-label="Import settings file" onChange={event => void importSettings(event.target.files?.[0])}/></div></div>
  </div>;
}

function ThemeButton({ theme, selected, onClick }: { theme: Theme; selected: boolean; onClick: (theme: Theme) => void }) {
  return <button type="button" className={`theme-option ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={() => onClick(theme)}><span>{theme === "system" ? "System" : theme === "light" ? "Light" : "Dark"}</span>{selected ? <Icon name="check" size={15}/> : null}</button>;
}
