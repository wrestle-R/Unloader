import { useDeferredValue, useMemo, useState } from "react";
import type { TabInfo } from "../shared/types";
import { Icon } from "./Icons";
import { describePolicy, formatIdle, sortedTabs, type UsageSort } from "./utils";

type ListItem = { kind: "window"; windowId: number; count: number } | { kind: "tab"; tab: TabInfo };
const ROW_HEIGHT = 72;

interface TabListProps {
  tabs: TabInfo[];
  search: string;
  sort: UsageSort;
  groupWindows?: boolean;
  usageView?: boolean;
  onUnload: (tab: TabInfo) => void;
  onRestore: (tab: TabInfo) => void;
}

export function TabList({ tabs, search, sort, groupWindows = true, usageView = false, onUnload, onRestore }: TabListProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const items = useMemo(() => {
    const filtered = tabs.filter(tab => `${tab.title} ${tab.hostname} ${tab.url}`.toLowerCase().includes(deferredSearch));
    if (!groupWindows) return sortedTabs(filtered, sort).map(tab => ({ kind: "tab", tab }) as ListItem);
    const byWindow = new Map<number, TabInfo[]>();
    for (const tab of filtered) {
      const group = byWindow.get(tab.windowId) ?? [];
      group.push(tab);
      byWindow.set(tab.windowId, group);
    }
    const result: ListItem[] = [];
    for (const [windowId, group] of byWindow) {
      result.push({ kind: "window", windowId, count: group.length });
      for (const tab of sortedTabs(group, sort)) result.push({ kind: "tab", tab });
    }
    return result;
  }, [tabs, deferredSearch, sort, groupWindows]);

  const viewportHeight = 552;
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 4);
  const last = Math.min(items.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + 4);

  if (items.length === 0) {
    return <div className="empty-state" data-testid="tab-list">
      <span className="empty-icon"><Icon name="layers" size={26} /></span>
      <h3>{tabs.length ? "No tabs match that search" : "No open tabs yet"}</h3>
      <p>{tabs.length ? "Try a page title or website name." : "Your open browser tabs will appear here."}</p>
    </div>;
  }

  return <div className="tab-list" data-testid="tab-list" role="list" tabIndex={0} aria-label={usageView ? "Page usage" : "Open tabs"} onScroll={event => setScrollTop(event.currentTarget.scrollTop)} onKeyDown={event => {
    if (event.target !== event.currentTarget) return;
    const list = event.currentTarget;
    if (event.key === "ArrowDown") { event.preventDefault(); list.scrollTop += ROW_HEIGHT; }
    else if (event.key === "ArrowUp") { event.preventDefault(); list.scrollTop -= ROW_HEIGHT; }
    else if (event.key === "PageDown") { event.preventDefault(); list.scrollTop += viewportHeight; }
    else if (event.key === "PageUp") { event.preventDefault(); list.scrollTop -= viewportHeight; }
    else if (event.key === "Home") { event.preventDefault(); list.scrollTop = 0; }
    else if (event.key === "End") { event.preventDefault(); list.scrollTop = items.length * ROW_HEIGHT; }
  }}>
    <div className="tab-list-track" style={{ height: items.length * ROW_HEIGHT }}>
      {items.slice(first, last).map((item, offset) => {
        const index = first + offset;
        if (item.kind === "window") {
          return <div className="window-row" style={{ top: index * ROW_HEIGHT }} key={`window-${item.windowId}`}>
            <span className="window-mark" /><span>Window {item.windowId}</span><span className="window-count">{item.count} {item.count === 1 ? "tab" : "tabs"}</span>
          </div>;
        }
        const tab = item.tab;
        return <div className="tab-row" style={{ top: index * ROW_HEIGHT }} key={tab.id} role="listitem">
          <div className="tab-icon" aria-hidden="true">{tab.favIconUrl ? <img src={tab.favIconUrl} alt="" onError={event => { event.currentTarget.style.display = "none"; }} /> : <Icon name="globe" size={17} />}</div>
          <div className="tab-main">
            <div className="tab-title" title={tab.title || tab.url}>{tab.title || tab.hostname || "Untitled tab"}{tab.pinned ? <span className="tiny-marker" title="Pinned">PINNED</span> : null}</div>
            <div className="tab-sub" title={tab.url}><span>{tab.hostname || "Browser page"}</span><span className="dot-separator" />{usageView ? <span>{describePolicy(tab)}</span> : <span>{formatIdle(tab.idleMinutes)}</span>}</div>
          </div>
          <span className={`status-pill ${tab.discarded ? "asleep" : "awake"}`}><span className="status-dot" />{tab.discarded ? "Unloaded" : "Loaded"}</span>
          <span className="tab-policy">{usageView ? "RAM unavailable" : describePolicy(tab)}</span>
          <button className="row-action" type="button" onClick={() => tab.discarded ? onRestore(tab) : onUnload(tab)} aria-label={`${tab.discarded ? "Restore" : "Unload"} ${tab.title || tab.hostname || "tab"}`}>
            <Icon name={tab.discarded ? "play" : "power"} size={16}/><span>{tab.discarded ? "Restore" : "Unload"}</span>
          </button>
        </div>;
      })}
    </div>
  </div>;
}
