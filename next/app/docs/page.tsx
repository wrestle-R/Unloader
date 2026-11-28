import type { Metadata } from "next";
import Link from "next/link";
import { addonUrl } from "../addon";

export const metadata: Metadata = { title: "Documentation" };
const sections = [
  ["start", "Get started"],
  ["rules", "Website rules"],
  ["memory", "Memory estimates"],
  ["safety", "Automatic unloading"],
  ["shortcuts", "Shortcuts"],
  ["data", "Your data"],
  ["chromium", "Install on Chromium"],
  ["troubleshooting", "Troubleshooting"],
] as const;

export default function Docs() {
  return <div className="docs-layout">
    <aside>
      <h2>On this page</h2>
      <nav aria-label="Documentation sections">{sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
    </aside>
    <article className="prose">
      <h1>Using Unloader</h1>
      <section id="start">
        <h2>Get started</h2>
        <ol>
          <li><a href={addonUrl}>Install from Firefox Add-ons</a> or <Link href="/download">download the Chromium build</Link>.</li>
          <li>Click the toolbar icon to unload the current tab or open <strong>Manage tabs</strong>.</li>
          <li>Open <strong>Website rules</strong> to change the default 15-minute idle timer. It runs in the background.</li>
        </ol>
      </section>
      <section id="rules">
        <h2>Website rules</h2>
        <p>A rule applies to the exact hostname, such as <code>web.whatsapp.com</code>.</p>
        <ul>
          <li><strong>Keep awake</strong> skips the idle timer and asks your browser to keep the site loaded.</li>
          <li><strong>Manual only</strong> skips Unloader’s idle timer for that site.</li>
          <li><strong>Custom timer</strong> sets an idle time from 1 to 1,440 minutes.</li>
        </ul>
        <p>Site rules take precedence over the default. You can still unload a tab yourself.</p>
      </section>
      <section id="memory">
        <h2>Memory estimates</h2>
        <p><strong>Estimated freed now</strong> adds up the typical memory use of currently unloaded tabs. Unloader uses a bundled catalog of common sites and a fallback for sites outside it. Your browser doesn’t expose a reliable live RAM reading per tab.</p>
      </section>
      <section id="safety">
        <h2>Automatic unloading</h2>
        <p>Pinned tabs follow the same rules as other tabs. The idle timer skips active tabs, pages that are loading, and pages with detected editing or playing media. It also skips pages it can’t check. Unloader works on regular website tabs and excludes private windows.</p>
      </section>
      <section id="shortcuts">
        <h2>Manual unloading and shortcuts</h2>
        <p>Use the Unload button or <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>U</kbd> (<kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>U</kbd> on macOS). Use <strong>Customize shortcut</strong> in Settings to change the key combination in your browser.</p>
      </section>
      <section id="data">
        <h2>Your data</h2>
        <p>Rules, recent activity and focused-tab usage stay in your browser. Settings lets you back up your rules, idle timer and appearance as a JSON file.</p>
        <Link href="/privacy">Read the privacy policy</Link>
      </section>
      <section id="chromium">
        <h2>Install on Chromium</h2>
        <ol>
          <li>Download and extract the Chromium ZIP from the <Link href="/download">download page</Link>.</li>
          <li>Open <code>chrome://extensions</code> or <code>brave://extensions</code> and enable <strong>Developer mode</strong>.</li>
          <li>Choose <strong>Load unpacked</strong> and select the extracted folder that contains <code>manifest.json</code>.</li>
        </ol>
      </section>
      <section id="troubleshooting">
        <h2>Troubleshooting</h2>
        <p>If an idle tab stays loaded, check its website rule and whether it has active media or editing. If the shortcut doesn’t respond, use <strong>Customize shortcut</strong> to try a different key combination.</p>
        <p><a href="https://github.com/wrestle-R/Unloader/issues">Report a problem on GitHub</a> without sharing private tab URLs.</p>
      </section>
    </article>
  </div>;
}
