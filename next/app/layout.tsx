import type { Metadata } from 'next';
import localFont from 'next/font/local';
import Link from 'next/link';
import './globals.css';
import './refresh.css';
const sans = localFont({ src: './fonts/Rubik.woff2', variable: '--font-sans', display: 'swap' });
const serif = localFont({ src: './fonts/NotoSerifDisplay.woff2', variable: '--font-serif', display: 'swap' });
export const metadata: Metadata = { title: { default: 'Unloader — Give your tabs a rest.', template: '%s · Unloader' }, description: 'A local-first tab unloader for Zen, Firefox, Chrome and Brave. Keep your tabs. Let idle pages rest.' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className={`${sans.variable} ${serif.variable}`}><header className="nav"><Link href="/" className="brand"><span className="mark" aria-hidden="true">↓</span>unloader<span className="brand-dot">.</span></Link><nav aria-label="Main navigation"><Link href="/docs">Documentation</Link><a href="https://github.com/wrestle-R/Unloader">GitHub ↗</a><Link className="nav-download" href="/download">Get Unloader <span>↓</span></Link></nav></header><main>{children}</main><footer><Link className="brand" href="/">unloader.</Link><p>Less running. More room.</p><div><Link href="/privacy">Privacy</Link><Link href="/docs">Docs</Link><a href="https://github.com/wrestle-R/Unloader/issues">Support ↗</a></div><span>Made for your browser, kept on your device.</span></footer></body></html>;
}
