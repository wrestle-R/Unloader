import Link from "next/link";
import { addonUrl } from "./addon";

export default function Home() {
  return <>
    <section className="hero">
      <div className="hero-content">
        <span className="eyebrow">For Firefox, Zen, Chrome & Brave</span>
        <h1>Keep your tabs.<br/>Free up some room.</h1>
        <p className="hero-copy">Unload pages you are not using. They stay in your tab bar, ready to reload when you need them.</p>
        <div className="actions">
          <a className="button" href={addonUrl}>Add to Firefox <span aria-hidden="true">↗</span></a>
          <Link className="text-link" href="/download">Other browsers</Link>
        </div>
        <p className="compatibility">Free to use <span>·</span> No account <span>·</span> Everything stays local</p>
      </div>
      <div>
        <div className="browser-demo" aria-label="Example of the Unloader dashboard with illustrative data">
          <div className="demo-toolbar"><strong>Unloader</strong><span>Tabs</span></div>
          <div className="demo-body">
            <div className="demo-label">Estimated freed now</div>
            <div className="demo-memory"><strong>1.4 <i>GiB</i></strong><div className="demo-bars" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/></div></div>
            <div className="demo-tab-row"><span>GitHub · Project workspace</span><span>Unloaded</span></div>
            <div className="demo-tab-row"><span>Notion · Meeting notes</span><span>Unloaded</span></div>
            <div className="demo-tab-row"><span>WhatsApp · Messages</span><span>Keep awake</span></div>
          </div>
        </div>
        <p className="demo-caption">Illustrative data. Memory figures are estimates based on typical site usage.</p>
      </div>
    </section>
    <section className="intro">
      <h2>A lighter browser.<br/>The same tab bar.</h2>
      <p>Start with a 15-minute idle timer, or decide when each page unloads. Your important pages stay ready, and the rest can wait.</p>
    </section>
    <section className="features" aria-label="Features">
      <article><span className="feature-number">01</span><h3>See your estimated savings</h3><p>View estimated memory freed now, total releases, and a seven-day trend in one compact overview.</p></article>
      <article><span className="feature-number">02</span><h3>Give each site a rule</h3><p>Keep messaging and work pages awake. Set a custom timer or unload a site manually.</p></article>
      <article><span className="feature-number">03</span><h3>Your data stays with you</h3><p>Rules, activity and estimates stay in your browser profile. No account or analytics.</p></article>
    </section>
    <section className="closing"><h2>Keep the pages. Lose some of the load.</h2><Link className="button" href="/download">Download Unloader <span aria-hidden="true">↓</span></Link></section>
  </>;
}
