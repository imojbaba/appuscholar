import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * recorded/capture.mjs and the e2e journey's own capture.mjs (apps/web/e2e/fixtures/recorded), `--only` (ruling B2-R19): each refuses to overwrite a recording that exists, and
 * refuses before it fetches, so a mistaken `--only` costs the live API no request. Run with a stand-in for fetch that reports each call on stderr; none must be made.
 */

const SCRIPT = fileURLToPath(new URL("./recorded/capture.mjs", import.meta.url));
const E2E_SCRIPT = fileURLToPath(new URL("../../../../apps/web/e2e/fixtures/recorded/capture.mjs", import.meta.url));
const STAND_IN = "data:text/javascript," + encodeURIComponent('globalThis.fetch = async (u) => { console.error("FETCH " + u); return new Response("{}", { status: 599 }); };'); // 599 is no status the corpus expects, so a call that gets through still writes nothing

function only(cases: string, script = SCRIPT) {
  const r = spawnSync(process.execPath, ["--import", STAND_IN, script, "--only", cases], { encoding: "utf8", timeout: 20000 });
  return { status: r.status, out: String(r.stdout) + String(r.stderr) };
}

describe("capture.mjs --only", () => {
  it("refuses a case whose recording exists, before it fetches", () => {
    const r = only("pm-pmid");
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/already exists and is not overwritten/);
    expect(r.out).not.toMatch(/FETCH /);
  });
  it("knows the paste and Europe PMC cases, and refuses them the same way once recorded", () => {
    for (const name of ["paste-cr-doi", "paste-cr-arxiv", "paste-oa-doi", "paste-oa-arxiv", "paste-oa-pmcid", "paste-oa-work", "paste-oa-nf", "paste-pmc-esummary", "paste-pm-nf", "epmc-oa", "epmc-nopmc", "epmc-nopmcid", "epmc-notoa", "epmc-unknown"]) {
      const r = only(name);
      expect(r.out, name).not.toMatch(/unknown case/);
      expect(r.out, name).toMatch(/already exists and is not overwritten/);
      expect(r.out, name).not.toMatch(/FETCH /);
    }
  });
  it("refuses every kind of v1 case the same way, oa-connected too (its search is not fetched first)", () => {
    for (const name of ["oa-plain", "oa-connected", "oa-retractions", "cr-doi", "cr-title3", "cr-title1", "pm-rct", "pm-v2-terms"]) {
      const r = only(name);
      expect(r.status, name).not.toBe(0);
      expect(r.out, name).toMatch(/already exists and is not overwritten/);
      expect(r.out, name).not.toMatch(/FETCH /);
    }
  });
  it("the e2e journey's script refuses a case whose recording exists before it fetches anything, even when it is not the first case named", () => {
    for (const cases of ["oa-connected-dordinejad", "cr-doi-dordinejad", "oa-retractions-forced,cr-doi-mu"]) {
      const r = only(cases, E2E_SCRIPT);
      expect(r.status, cases).not.toBe(0);
      expect(r.out, cases).toMatch(/already exists and is not overwritten/);
      expect(r.out, cases).not.toMatch(/FETCH /);
    }
    const unknown = only("no-such-case", E2E_SCRIPT);
    expect(unknown.status).not.toBe(0);
    expect(unknown.out).toMatch(/unknown case "no-such-case"/);
  });
  it("an unknown case name is refused, and names the cases", () => {
    const r = only("no-such-case");
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/unknown case "no-such-case"/);
  });
});
