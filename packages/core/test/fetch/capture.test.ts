import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * recorded/capture.mjs and the e2e journey's own capture.mjs (apps/web/e2e/fixtures/recorded), `--only` (ruling B2-R19): each refuses to overwrite a recording that exists, and
 * refuses before it fetches, so a mistaken `--only` costs the live API no request. Run with a stand-in for fetch that reports each call on stderr; none must be made.
 * Every named case is checked before the first request, whatever order they are named in (core fix round): `--only a-new-case,paste-cr-doi` must not record the new case and then stop.
 */

const SCRIPT = fileURLToPath(new URL("./recorded/capture.mjs", import.meta.url));
const E2E_SCRIPT = fileURLToPath(new URL("../../../../apps/web/e2e/fixtures/recorded/capture.mjs", import.meta.url));
const STAND_IN = "data:text/javascript," + encodeURIComponent('globalThis.fetch = async (u) => { console.error("FETCH " + u); return new Response("{}", { status: 599 }); };'); // 599 is no status the corpus expects, so a call that gets through still writes nothing

const RECORDED = dirname(SCRIPT);
const TABLES = fileURLToPath(new URL("../../src/data/research-tables.ts", import.meta.url));

/**
 * Runs `body` with a copy of capture.mjs that sits beside a copy of the recordings missing the files that match `without`, so a case that is not recorded can be named while the real
 * directory stays as it is (a stand-in for fetch makes no request that counts, and `--only` writes nothing it does not fetch). The script finds its recordings and
 * src/data/research-tables.ts from its own place, so the copy has the same layout. The path is the real one: a symlinked tmpdir would make Node's argv[1] differ from import.meta.url.
 */
function withoutRecordings(without: RegExp, body: (script: string) => void) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "capture-only-")));
  try {
    const dir = join(root, "test", "fetch", "recorded");
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(root, "src", "data"), { recursive: true });
    cpSync(RECORDED, dir, { recursive: true, filter: (src) => !without.test(basename(src)) });
    copyFileSync(TABLES, join(root, "src", "data", "research-tables.ts"));
    body(join(dir, "capture.mjs"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

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
  it("checks every named case before it fetches for the first: a case that is not recorded, named with one that is, records nothing", () => {
    // cr-title1 has no recordings in the copy, so by itself it is fetched (the control: the copy does reach fetch). Named with paste-cr-doi, which is recorded, it must not be.
    withoutRecordings(/^cr-title1-/, (script) => {
      const alone = only("cr-title1", script);
      expect(alone.out).toMatch(/FETCH https:\/\/api\.crossref\.org\/works\?rows=1/);
      for (const cases of ["cr-title1,paste-cr-doi", "paste-cr-doi,cr-title1", "cr-title1,cr-doi", "pm-pmid,cr-title1,epmc-oa"]) {
        const r = only(cases, script);
        expect(r.status, cases).not.toBe(0);
        expect(r.out, cases).toMatch(/already exists and is not overwritten/);
        expect(r.out, cases).not.toMatch(/FETCH /);
      }
    });
  });
  it("checks the other kinds of case the same way: a pubmed search, a lookup, an OpenAlex search and the two-file oa-retractions, each first in the list and not yet recorded", () => {
    for (const [missing, name] of [[/^pm-esearch-v2-rct-/, "pm-v2-rct"], [/^paste-oa-nf-/, "paste-oa-nf"], [/^oa-search-zero-/, "oa-zero"], [/^oa-(retractions|refcheck)-/, "oa-retractions"], [/^cr-doi-/, "cr-doi"]] as const) {
      withoutRecordings(missing, (script) => {
        expect(only(name, script).out, name).toMatch(/FETCH /); // control: it is fetched when it is the only case
        const r = only(name + ",epmc-oa", script);
        expect(r.status, name).not.toBe(0);
        expect(r.out, name).toMatch(/epmc-search-oa-[0-9a-f]{8}\.json already exists and is not overwritten/);
        expect(r.out, name).not.toMatch(/FETCH /);
      });
    }
  });
  it("names, for every case, the files the check looks for, and those are the files in the corpus (so the check and the recording cannot drift apart)", async () => {
    const mod = (await import(/* @vite-ignore */ SCRIPT)) as { caseNames: () => Set<string>; filesOfCase: (name: string) => { files: string[]; prefixes: string[] } };
    const names = [...mod.caseNames()];
    expect(names.length).toBeGreaterThan(40);
    for (const name of names) {
      const { files, prefixes } = mod.filesOfCase(name);
      expect(files.length + prefixes.length, name).toBeGreaterThan(0);
      for (const f of files) expect(existsSync(join(RECORDED, f)), name + ": " + f).toBe(true);
    }
    expect(mod.filesOfCase("oa-connected").prefixes).toEqual(["oa-connected-"]);
  });
  it("an unknown case name is refused, and names the cases", () => {
    const r = only("no-such-case");
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/unknown case "no-such-case"/);
  });
});
