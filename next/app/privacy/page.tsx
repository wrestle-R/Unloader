import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return <article className="prose privacy">
    <h1>Privacy</h1>
    <p className="lead">Unloader keeps your browsing data on your device.</p>
    <section>
      <h2>What stays in your browser</h2>
      <p>Settings, site rules, recent activity, memory estimates and focused-tab usage stay in your browser profile. Unloader reads tab titles and URLs to display and manage your tabs. Private tabs are excluded.</p>
      <h2>Editing and media</h2>
      <p>Unloader checks whether a page is being edited or playing media for the idle timer. It stores neither form text nor form values.</p>
      <h2>Extension permissions</h2>
      <p>Tab access lets Unloader manage pages. Storage keeps settings and history. Alarms run the idle timer. The browser’s idle state pauses usage tracking while your device is locked. Webpage access lets Unloader check editing and media activity.</p>
      <h2>Data collection</h2>
      <p>Unloader has no account, analytics, advertising or remote data service. Removing the extension removes its local storage. The website hosting provider may process standard request logs.</p>
      <h2>Contact</h2>
      <p><a href="https://github.com/wrestle-R/Unloader/issues">Open a GitHub issue</a> for privacy questions. Keep private browsing data out of the report.</p>
    </section>
  </article>;
}
