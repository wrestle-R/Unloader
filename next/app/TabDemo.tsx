"use client";

import { useState } from "react";

const tabs = [
  { id: "docs", label: "Docs", title: "Web platform docs", host: "developer.mozilla.org", initial: "D", rule: "Active tab" },
  { id: "design", label: "Figma", title: "Design files", host: "figma.com", initial: "F", rule: "" },
  { id: "chat", label: "Chat", title: "Team chat", host: "web.whatsapp.com", initial: "W", rule: "Keep awake" },
] as const;

export function TabDemo() {
  const [unloaded, setUnloaded] = useState(false);

  return <figure className="demo">
    <div className="demo-window">
      <div className="demo-toolbar">
        <span className="window-dots" aria-hidden="true"><i/><i/><i/></span>
        <span>Interactive demo</span>
      </div>
      <div className="demo-strip" aria-label="Example browser tab bar">
        {tabs.map(tab => (
          <span key={tab.id} className={`demo-tab ${tab.id === "docs" ? "current" : ""} ${tab.id === "design" && unloaded ? "resting" : ""}`}>
            <span className={`site-symbol ${tab.id}`} aria-hidden="true">{tab.initial}</span>
            <span>{tab.label}</span>
            {tab.id === "design" && unloaded ? <span className="sr-only">unloaded</span> : null}
          </span>
        ))}
      </div>
      <div className="demo-content">
        <div className="demo-result" aria-live="polite" aria-atomic="true">
          <div><span>Estimated freed now</span><strong>{unloaded ? "620 MiB" : "0 MiB"}</strong></div>
          <span>{unloaded ? "1 unloaded tab" : "0 unloaded tabs"}</span>
        </div>
        <ul className="demo-list">
          {tabs.map(tab => (
            <li key={tab.id} className={tab.id === "design" && unloaded ? "resting" : ""}>
              <span className={`site-symbol ${tab.id}`} aria-hidden="true">{tab.initial}</span>
              <div className="demo-site"><strong>{tab.title}</strong><span>{tab.host}</span></div>
              {tab.id === "design"
                ? <button type="button" className="demo-toggle" onClick={() => setUnloaded(value => !value)}>
                    {unloaded ? "Restore" : "Unload"}<span className="sr-only"> {tab.title}</span>
                  </button>
                : <span className="demo-status">{tab.rule}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
    <figcaption>Unload Design files and watch its tab stay in the bar. Memory shown is an estimate.</figcaption>
  </figure>;
}
