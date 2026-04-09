import type { Metadata } from "next";
import { Instrument_Sans, Space_Grotesk, Inter, Geist } from "next/font/google";
import Link from "next/link";

import "@/app/globals.css";
import { MetaPixel } from "@/components/meta-pixel";
import { publicEnv } from "@/lib/public-env";
import { cn } from "@/lib/utils";

const geistHeading = Geist({subsets:['latin'],variable:'--font-heading'});

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

const bodyFont = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Pointerly",
  description: "A paid desktop AI companion with a premium web onboarding and billing flow.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", inter.variable, geistHeading.variable)}>
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <div className="site-shell">
          <div className="site-gradient site-gradient-top" />
          <div className="site-gradient site-gradient-bottom" />
          <header className="site-header">
            <Link href="/" className="site-logo">
              Pointerly
            </Link>
            <nav className="site-nav">
              <Link href="/pricing">Pricing</Link>
              <Link href="/device">Connect desktop</Link>
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/sign-in" className="site-nav-pill">
                Sign in
              </Link>
            </nav>
          </header>
          {children}
        </div>
        {publicEnv.NEXT_PUBLIC_META_PIXEL_ID ? (
          <MetaPixel pixelId={publicEnv.NEXT_PUBLIC_META_PIXEL_ID} />
        ) : null}
      </body>
    </html>
  );
}
