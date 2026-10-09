import type { Metadata } from 'next';
import localFont from 'next/font/local';
import Link from 'next/link';
import Script from 'next/script';
import { ThemeSelect } from './ThemeSelect';
import './theme.css';
import './globals.css';
const sans = localFont({ src: './fonts/Rubik.woff2', variable: '--font-sans', display: 'swap' });
export const metadata: Metadata = { title: { default: 'Unloader — Give your tabs a rest.', template: '%s · Unloader' }, description: 'A local-first tab unloader for Zen, Firefox, Chrome and Brave. Keep your tabs. Let idle pages rest.' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning><head><Script id="theme-initializer" strategy="beforeInteractive">{`try{var t=localStorage.getItem("unloader-website-theme");document.documentElement.dataset.theme=t==="light"||t==="dark"?t:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){}`}</Script></head><body className={sans.variable}><a className="skip-link" href="#main-content">Skip to content</a><header className="nav"><Link href="/" className="brand"><span className="mark" aria-hidden="true"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/></svg></span>Unloader</Link><nav aria-label="Main navigation"><Link href="/docs">Documentation</Link><a href="https://github.com/wrestle-R/Unloader">GitHub ↗</a><Link className="nav-download" href="/download">Download</Link><ThemeSelect/></nav></header><main id="main-content" tabIndex={-1}>{children}</main><footer><Link className="brand" href="/">Unloader</Link><p>Keep your tabs. Free up some room.</p><div><Link href="/privacy">Privacy</Link><Link href="/docs">Docs</Link><a href="https://github.com/wrestle-R/Unloader/issues">Support ↗</a></div><span>Made for your browser, kept on your device.</span></footer></body></html>;
}
