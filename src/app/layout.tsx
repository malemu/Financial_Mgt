import type { Metadata } from "next";
import { Fraunces, Space_Grotesk } from "next/font/google";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "Conviction OS | Net Worth Execution",
  description:
    "AI-assisted portfolio execution with explicit allocation, disciplined rebalancing, and goal-based projections.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body
        className={`${spaceGrotesk.variable} ${fraunces.variable} antialiased`}
      >
        <header className="relative">
          <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 rounded-b-3xl bg-[color:var(--nav-bar)] px-6 py-5 text-[color:var(--nav-bar-ink)] shadow-[var(--shadow)] lg:px-10">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm font-semibold text-[color:var(--nav-bar-ink)]">
                CO
              </div>
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-[0.3em] text-white/70">
                  Conviction OS
                </span>
                <span className="font-display text-lg text-[color:var(--nav-bar-ink)]">
                  Net Worth Execution
                </span>
              </div>
            </div>
            <div className="flex flex-1 items-center justify-center">
              <div className="flex flex-nowrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
                <a
                  href="/"
                  className="border-b-2 border-transparent px-1 pb-1 text-white transition hover:border-white/90"
                >
                  Home
                </a>
                <a
                  href="/portfolio"
                  className="border-b-2 border-transparent px-1 pb-1 text-white transition hover:border-white/90"
                >
                  Portfolio
                </a>
                <a
                  href="/buy-rent"
                  className="border-b-2 border-transparent px-1 pb-1 text-white transition hover:border-white/90"
                >
                  Buy/Rent
                </a>
                <a
                  href="/kids-invest"
                  className="border-b-2 border-transparent px-1 pb-1 text-white transition hover:border-white/90"
                >
                  Kids Simulator
                </a>
                <a
                  href="/optimal-dca-entry"
                  className="border-b-2 border-transparent px-1 pb-1 text-white transition hover:border-white/90"
                >
                  Optimal DCA Entry
                </a>
                <a
                  href="/housing-intelligence"
                  className="border-b-2 border-transparent px-1 pb-1 text-white transition hover:border-white/90"
                >
                  Housing Intelligence
                </a>
              </div>
            </div>
            <ThemeToggle />
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
