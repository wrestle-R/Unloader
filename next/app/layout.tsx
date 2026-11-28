import type { Metadata } from "next";
import localFont from "next/font/local";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { ThemeSelect } from "./ThemeSelect";
import "./theme.css";
import "./globals.css";

const sans = localFont({ src: "./fonts/Rubik.woff2", variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Unloader | Free memory without closing tabs", template: "%s | Unloader" },
  description: "Unload idle pages without closing their tabs. Unloader is a local-first browser extension for Firefox, Zen, Chrome and Brave.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning>
    <head><Script id="theme-initializer" strategy="beforeInteractive">{`try{var t=localStorage.getItem("unloader-website-theme");document.documentElement.dataset.theme=t==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}`}</Script></head>
    <body className={sans.variable}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="nav">
        <Link href="/" className="brand"><Image src="/icon.svg" width={32} height={32} alt="" unoptimized/>Unloader</Link>
        <nav aria-label="Main navigation">
          <Link href="/docs">Docs</Link>
          <a href="https://github.com/wrestle-R/Unloader">GitHub</a>
          <ThemeSelect/>
          <Link className="nav-download" href="/download">Download</Link>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>{children}</main>
      <footer>
        <Link className="brand" href="/"><Image src="/icon.svg" width={26} height={26} alt="" unoptimized/>Unloader</Link>
        <nav aria-label="Footer navigation">
          <Link href="/privacy">Privacy</Link>
          <Link href="/docs">Docs</Link>
          <a href="https://github.com/wrestle-R/Unloader/issues">Support</a>
        </nav>
      </footer>
    </body>
  </html>;
}
