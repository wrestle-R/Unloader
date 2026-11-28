import type { Metadata } from "next";
import Link from "next/link";
import { addonUrl } from "../addon";

export const metadata: Metadata = { title: "Download" };
const chromiumZip = "https://github.com/wrestle-R/Unloader/releases/latest/download/unloader-chromium.zip";

export default function Download() {
  return <div className="download-page">
    <h1>Get Unloader</h1>
    <p className="lead">Choose your browser to get started.</p>
    <div className="download-grid">
      <article>
        <h2>Firefox &amp; Zen</h2>
        <p>Install from Mozilla Add-ons. Unloader stays installed when you restart your browser.</p>
        <div className="download-actions">
          <a className="button" href={addonUrl}>Install from Mozilla Add-ons <span aria-hidden="true">↗</span></a>
        </div>
      </article>
      <article>
        <h2>Chrome &amp; Brave</h2>
        <p>Extract the ZIP, turn on Developer mode and choose <strong>Load unpacked</strong> in your extension manager.</p>
        <div className="download-actions">
          <a className="button" href={chromiumZip}>Download Chrome ZIP</a>
          <a className="button secondary" href={chromiumZip}>Download Brave ZIP</a>
        </div>
        <div className="download-links"><Link className="text-link" href="/docs#chromium">Chromium install steps</Link></div>
      </article>
    </div>
  </div>;
}
