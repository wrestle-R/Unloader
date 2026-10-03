import type { SVGProps } from "react";

export type IconName =
  | "layers" | "moon" | "sun" | "arrow" | "external" | "search" | "chevron"
  | "shield" | "clock" | "sliders" | "chart" | "activity" | "settings"
  | "power" | "play" | "download" | "upload" | "check" | "warning" | "close"
  | "plus" | "trash" | "keyboard" | "menu" | "info" | "refresh" | "globe";

const paths: Record<IconName, React.ReactNode> = {
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
  moon: <path d="M20.2 15.3A8.6 8.6 0 0 1 8.7 3.8a8.6 8.6 0 1 0 11.5 11.5Z"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
  arrow: <><path d="M5 12h14m-6-6 6 6-6 6"/></>,
  external: <><path d="M13 5h6v6m0-6-8 8"/><path d="M19 13v6H5V5h6"/></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></>,
  chevron: <path d="m6 9 6 6 6-6"/>,
  shield: <><path d="M12 3 4.5 6v5.7c0 4.7 3 7.5 7.5 9.3 4.5-1.8 7.5-4.6 7.5-9.3V6L12 3Z"/><path d="m9 12 2 2 4-4"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>,
  sliders: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="16" cy="17" r="2"/></>,
  chart: <><path d="M4 20V4M4 20h16"/><path d="m7 16 4-5 3 2 5-7"/></>,
  activity: <><path d="M3 12h4l2.5-6 5 12 2.5-6H21"/></>,
  settings: <><path d="M10 2h4l.8 2.3 2 .9 2.2-1 2.8 2.8-1 2.2.9 2L24 12v.1l-2.3.8-.9 2 1 2.2-2.8 2.8-2.2-1-2 .9L14 22h-4l-.8-2.3-2-.9-2.2 1-2.8-2.8 1-2.2-.9-2L0 12l2.3-.8.9-2-1-2.2L5 4.2l2.2 1 2-.9L10 2Z" transform="translate(1.8 1.8) scale(.85)"/><circle cx="12" cy="12" r="3"/></>,
  power: <><path d="M12 3v9"/><path d="M7.1 5.8a8 8 0 1 0 9.8 0"/></>,
  play: <path d="m8 5 11 7-11 7V5Z"/>,
  download: <><path d="M12 3v12m-4-4 4 4 4-4"/><path d="M4 17v3h16v-3"/></>,
  upload: <><path d="M12 16V4m-4 4 4-4 4 4"/><path d="M4 17v3h16v-3"/></>,
  check: <path d="m4 12 5 5L20 6"/>,
  warning: <><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/></>,
  close: <path d="M5 5 19 19M19 5 5 19"/>,
  plus: <path d="M12 4v16M4 12h16"/>,
  trash: <><path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7"/><path d="M10 11v6m4-6v6"/></>,
  keyboard: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 9h1m3 0h1m3 0h1m3 0h1M5 12h1m3 0h1m3 0h1m3 0h1M7 16h10"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/></>,
  refresh: <><path d="M20 11a8 8 0 1 0-.8 4M20 5v6h-6"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></>,
};

export function Icon({ name, size = 20, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
