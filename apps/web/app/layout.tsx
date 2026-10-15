import type { Metadata } from "next";
import { headers } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Fraunces } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["600"], variable: "--font-fraunces", display: "swap" });

export const metadata: Metadata = { title: "Appuscholar", description: "A writing and research helper for psychology students." };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${fraunces.variable}`}>
      <head>{nonce ? <meta property="csp-nonce" content={nonce} /> : null}</head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
