import type { Metadata } from "next";
import { headers } from "next/headers";
import { IBM_Plex_Sans, IBM_Plex_Sans_Devanagari, Fraunces } from "next/font/google";
import { getServerLang } from "@/lib/serverLang";
import "./globals.css";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });
const plexDev = IBM_Plex_Sans_Devanagari({ subsets: ["devanagari", "latin"], weight: ["400", "500", "600"], variable: "--font-plex-devanagari", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], weight: ["600"], style: ["normal", "italic"], variable: "--font-fraunces", display: "swap" });

export const metadata: Metadata = { title: "Appuscholar", description: "A writing and research helper for psychology students." };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const lang = await getServerLang();
  return (
    <html lang={lang} className={`${plex.variable} ${plexDev.variable} ${fraunces.variable}`}>
      <head>{nonce ? <meta property="csp-nonce" content={nonce} /> : null}</head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
