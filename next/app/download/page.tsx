import type { Metadata } from "next";
import Link from "next/link";
import { addonUrl } from "../addon";

export const metadata: Metadata = { title: "Download" };
const releases = "https://github.com/wrestle-R/Unloader/releases";

export default function Download() {
  const signed = process.env.NEXT_PUBLIC_SIGNED_XPI_URL;

  return <div className="download-page">
    <h1>Get Unloader</h1>
    <p className="lead">Choose your browser to get started.</p>
    <div className="download-grid">
      <article>
        <h2>Firefox &amp; Zen</h2>
        <p>Install from Mozilla Add-ons. Unloader stays installed when you restart your browser.</p>
        <a className="button" href={addonUrl}>Install from Mozilla Add-ons <span aria-hidden="true">↗</span></a>
        <div className="download-links">
          {signed ? <a className="text-link" href={signed}>Signed XPI</a> : null}
          <a className="text-link" href={releases}>Release notes</a>
        </div>
      </article>
      <article>
        <h2>Chrome &amp; Brave</h2>
        <p>Extract the ZIP, turn on Developer mode and choose <strong>Load unpacked</strong> in your extension manager.</p>
        <a className="button" href={`${releases}/latest/download/unloader-chromium.zip`}>Download Chromium ZIP</a>
        <div className="download-links"><Link className="text-link" href="/docs#chromium">Chromium install steps</Link></div>
      </article>
    </div>
    <section className="download-note" aria-labelledby="temporary-title">
      <h3 id="temporary-title">Temporary Firefox build</h3>
      <p>Load the unsigned ZIP through <code>about:debugging</code> for testing. Firefox removes it when you restart.</p>
      <a className="text-link" href={`${releases}/download/v0.2.0/unloader-firefox-unsigned.zip`}>Download Firefox development ZIP</a>
    </section>
  </div>;
}
