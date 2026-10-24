import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8788";
  // The stage-2 panels fetch OpenAlex, PubMed (E-utilities) and Crossref from the browser, as v1 does: the api is never a proxy for them.
  const literature = "https://api.openalex.org https://eutils.ncbi.nlm.nih.gov https://api.crossref.org";
  // Europe PMC's open-access full text (OJ's answer 2, D-S2-127): a kept paper's DOI or PMC number goes to this one host, and the XML of the paper's text comes back. It answers cross-origin
  // requests (access-control-allow-origin: *), so the api is not a proxy for it either. Nothing else of ebi.ac.uk is allowed.
  const fullText = "https://www.ebi.ac.uk";
  // The Words tab looks a word up at dictionaryapi.dev from the browser, as v1 did (D-S2-90); the word is sent to that service and the footer says so.
  const dictionary = "https://api.dictionaryapi.dev";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' blob: data: https://*.public.blob.vercel-storage.com",
    `connect-src 'self' ${api} ${literature} ${fullText} ${dictionary}`,
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; ");
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return res;
}
export const config = { matcher: [{ source: "/((?!api|_next/static|_next/image|favicon.ico).*)" }] };
