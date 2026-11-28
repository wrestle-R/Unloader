import Link from "next/link";
import { addonUrl } from "./addon";
import { TabDemo } from "./TabDemo";

export default function Home() {
  return <>
    <section className="hero">
      <div className="hero-copy">
        <h1>Keep the tabs.<br/>Free the memory.</h1>
        <p>Unloader puts idle pages to sleep. Their tabs stay where you left them and reload when you return.</p>
        <div className="hero-actions">
          <a className="button" href={addonUrl}>Add to Firefox <span aria-hidden="true">↗</span></a>
          <Link className="button secondary" href="/download">Other browsers</Link>
        </div>
        <p className="hero-platforms">Firefox, Zen, Chrome and Brave</p>
      </div>
      <TabDemo />
    </section>

    <section className="how-it-works" aria-labelledby="timer-title">
      <div>
        <h2 id="timer-title">Leave a tab for 15 minutes.</h2>
        <p>That’s the default. Once an eligible page has been idle long enough, Unloader unloads it in the background. Open the tab again to reload the page.</p>
      </div>
      <ol className="idle-sequence">
        <li><span className="sequence-mark" aria-hidden="true"><i/></span>Leave the tab</li>
        <li><span className="sequence-mark sleeping" aria-hidden="true"><i/></span>Page unloads</li>
        <li><span className="sequence-mark reopened" aria-hidden="true"><i/></span>Open it to reload</li>
      </ol>
    </section>

    <section className="site-rules" aria-labelledby="rules-title">
      <div className="example-rules">
        <ul aria-label="Example website rules">
          <li><span className="site-symbol chat" aria-hidden="true">W</span><strong>web.whatsapp.com</strong><span>Keep awake</span></li>
          <li><span className="site-symbol docs" aria-hidden="true">D</span><strong>developer.mozilla.org</strong><span>After 30 min</span></li>
          <li><span className="site-symbol design" aria-hidden="true">F</span><strong>figma.com</strong><span>Manual only</span></li>
        </ul>
      </div>
      <div className="rules-copy">
        <h2 id="rules-title">Give each site its own rule.</h2>
        <p>Keep your chats loaded, set a longer timer for docs, or unload a site only when you ask. Set the default once and make exceptions where you need them.</p>
        <Link className="text-link" href="/docs#rules">How site rules work <span aria-hidden="true">↗</span></Link>
      </div>
    </section>

    <section className="closing" aria-labelledby="install-title">
      <div><h2 id="install-title">Get Unloader</h2><p>Your rules and activity stay in your browser. There’s no account to set up.</p></div>
      <Link className="button" href="/download">Choose your browser</Link>
    </section>
  </>;
}
