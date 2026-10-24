import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

const connectSrc = (csp: string) => (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("connect-src ")) ?? "").split(/\s+/).slice(1);

describe("the content security policy", () => {
  it("lets the browser reach the api and the three literature services the stage-2 panels fetch from (OpenAlex, PubMed's E-utilities, Crossref), the dictionary the Words tab fetches from, and nothing else", () => {
    const res = proxy(new NextRequest("http://localhost:3000/"));
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(connectSrc(csp).sort()).toEqual(["'self'", process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8788", "https://api.crossref.org", "https://api.dictionaryapi.dev", "https://api.openalex.org", "https://eutils.ncbi.nlm.nih.gov"].sort());
  });
  it("lets the Words tab look a word up at dictionaryapi.dev straight from the browser, as v1 did, and only that host (D-S2-90)", () => {
    const csp = proxy(new NextRequest("http://localhost:3000/")).headers.get("Content-Security-Policy") ?? "";
    expect(connectSrc(csp)).toContain("https://api.dictionaryapi.dev");
    expect(connectSrc(csp).filter((h) => h.includes("dictionaryapi"))).toEqual(["https://api.dictionaryapi.dev"]);
  });
});
