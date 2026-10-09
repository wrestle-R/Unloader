"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const storageKey = "unloader-website-theme";

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch { return "system"; }
}

export function ThemeSelect() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const next = readTheme();
      setTheme(next);
      document.documentElement.dataset.theme = next === "system" ? (media.matches ? "dark" : "light") : next;
    };
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function changeTheme(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : next;
    try { localStorage.setItem(storageKey, next); } catch { /* Theme still works without persistence. */ }
  }

  return <label className="website-theme">
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></svg>
    <select aria-label="Color theme" value={theme} onChange={event => changeTheme(event.target.value as Theme)}>
      <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
    </select>
  </label>;
}
