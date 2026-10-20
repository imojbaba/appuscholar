import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

const connectSrc = (csp: string) => (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("connect-src ")) ?? "").split(/\s+/).slice(1);

describe("the content security policy", () => {
  it("lets the browser reach the api and the three literature services the stage-2 panels fetch from (OpenAlex, PubMed's E-utilities, Crossref), and nothing else", () => {
    const res = proxy(new NextRequest("http://localhost:3000/"));
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(connectSrc(csp).sort()).toEqual(["'self'", process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8788", "https://api.crossref.org", "https://api.openalex.org", "https://eutils.ncbi.nlm.nih.gov"].sort());
  });
});
