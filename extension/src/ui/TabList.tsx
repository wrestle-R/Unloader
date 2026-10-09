import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { TabInfo } from "../shared/types";
import { Icon } from "./Icons";
import { describePolicy, formatIdle, sortedTabs, type UsageSort } from "./utils";

type ListItem = { kind: "window"; windowId: number; count: number } | { kind: "tab"; tab: TabInfo };
const BATCH_SIZE = 50;

interface TabListProps {
  tabs: TabInfo[];
  search: string;
  sort: UsageSort;
  groupWindows?: boolean;
  busy?: boolean;
  onUnload: (tab: TabInfo) => void;
  onRestore: (tab: TabInfo) => void;
}

export function TabList({ tabs, search, sort, groupWindows = true, busy = false, onUnload, onRestore }: TabListProps) {
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
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

  useEffect(() => setVisibleCount(BATCH_SIZE), [deferredSearch, sort, groupWindows, tabs.length]);
  const visibleItems = items.slice(0, visibleCount);

  if (items.length === 0) {
    return <div className="empty-state" data-testid="tab-list">
      <span className="empty-icon"><Icon name="layers" size={26} /></span>
      <h3>{tabs.length ? "No tabs match that search" : "No open tabs yet"}</h3>
      <p>{tabs.length ? "Try a page title or website name." : "Your open browser tabs will appear here."}</p>
    </div>;
  }

  return <><div className="table-heading" aria-hidden="true"><span>Page</span><span>Status</span><span>Unloading rule</span><span>Action</span></div><div className="tab-list" data-testid="tab-list" role="list" aria-label="Open tabs">
      {visibleItems.map((item) => {
        if (item.kind === "window") {
          return <div className="window-row" key={`window-${item.windowId}`}>
            <span className="window-mark" /><span>Window {item.windowId}</span><span className="window-count">{item.count} {item.count === 1 ? "tab" : "tabs"}</span>
          </div>;
        }
        const tab = item.tab;
        return <div className="tab-row" key={tab.id} role="listitem">
          <div className="tab-icon" aria-hidden="true">{tab.favIconUrl ? <img src={tab.favIconUrl} alt="" onError={event => { event.currentTarget.style.display = "none"; }} /> : <Icon name="globe" size={17} />}</div>
          <div className="tab-main">
            <div className="tab-title" title={tab.title || tab.url}>{tab.title || tab.hostname || "Untitled tab"}{tab.pinned ? <span className="tiny-marker" title="Pinned">PINNED</span> : null}</div>
            <div className="tab-sub" title={tab.url}><span>{tab.hostname || "Browser page"}</span><span className="dot-separator" /><span>{formatIdle(tab.idleMinutes)}</span><span className="mobile-policy">{describePolicy(tab)}</span></div>
          </div>
          <span className={`status-pill ${tab.discarded ? "asleep" : "awake"}`}><span className="status-dot" />{tab.discarded ? "Unloaded" : "Loaded"}</span>
          <span className="tab-policy">{describePolicy(tab)}</span>
          <button className={`row-action ${tab.discarded ? "restore" : ""}`} disabled={busy || !/^https?:\/\//i.test(tab.url)} title={!/^https?:\/\//i.test(tab.url) ? "Browser and extension pages are excluded" : undefined} type="button" onClick={() => tab.discarded ? onRestore(tab) : onUnload(tab)} aria-label={`${tab.discarded ? "Restore" : "Unload"} ${tab.title || tab.hostname || "tab"}`}>
            <Icon name={tab.discarded ? "play" : "power"} size={16}/><span>{tab.discarded ? "Restore" : "Unload"}</span>
          </button>
        </div>;
      })}
  </div>{visibleItems.length < items.length ? <div className="load-more"><button className="button secondary" type="button" onClick={() => setVisibleCount(count => count + BATCH_SIZE)}>Show more tabs <span>{Math.min(BATCH_SIZE, items.length - visibleItems.length)} of {items.length - visibleItems.length}</span></button></div> : null}</>;
}
