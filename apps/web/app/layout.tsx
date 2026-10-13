import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
export const metadata: Metadata = { title: "Appuscholar", description: "A writing and research helper for psychology students." };
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en">
      <head>{nonce ? <meta property="csp-nonce" content={nonce} /> : null}</head>
      <body>{children}</body>
    </html>
  );
}
