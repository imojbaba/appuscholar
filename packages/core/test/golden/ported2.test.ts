import { describe, it, expect } from "vitest";
import { PLAIN_OUT, contentLangInstruction, buildWritingPrompt, buildDraftFirstPrompt, buildChatPrompt } from "../../src/prompts";
import type { WritingKind } from "../../src/prompts";
import { parseV1Backup, v1BodyToHtml } from "../../src/v1import";
import { sanitizeHtml } from "../../src/sanitize";
import { unlockV1Backup, isLockedV1Backup } from "../../src/v1locked";
import { readFixture } from "./harness/fixture";

/**
 * Three more modules ported by hand in earlier phases (prompts.ts, v1import.ts, v1locked.ts), checked against v1's own outputs for the first time (spec §5.8).
 * Every module output below is compared with a value read from test/golden/<module>/*.json, which `golden:capture` records from v1 running: v1's prompts as its entry points
 * hand them to callAI, bodyToHTML's output for each body, the locked bundles bkEncrypt returns. A mismatch is a bug in the module or a row in
 * docs/superpowers/specs/parity-deviations.md, never an edit to a fixture.
 * What is typed in this file is of two kinds. Register pins, which state the register's own claims about a difference and check them against the fixture: D-W0-5
 * (what v2 does to a plain body, an escaped picture and an appuimg: reference that v1 does differently). Guards that a fixture holds the inputs it exists for: counts, the kinds of
 * body, the ids of the cases that use the long paragraph or My Writing Style, the two fields of study, the compressed and uncompressed locked files and v1's 600,000 rounds.
 */

describe("prompts.ts equals v1's prompts", () => {
  type Opts = { temp: number; max: number };
  type Case = { id: string; draftFirst: boolean; contentLang: string; field: string; style: string; input: string; prompt: string; opts: Opts } & (
    | { entry: "continueWriting" | "improveText" | "makeLonger"; kind: WritingKind }
    | { entry: "draftFeedback"; kind: "tail" | "improve" | "expand" }
    | { entry: "askAI" }
  );
  const fx = readFixture<{ cases: Case[]; plainOut: string; enInstruction: string; hiInstruction: string; editorText: string; longEditorText: string; question: string }>("prompts", "cases");
  /** What the module builds for the inputs v1 read: the tail or selection text, the question and the field, and the style block v1's stylePrompt() returned. */
  const built = (c: Case) => {
    switch (c.entry) {
      case "draftFeedback": return buildDraftFirstPrompt(c.kind, c.input);
      case "askAI": return buildChatPrompt(c.field, c.input);
      default: return buildWritingPrompt(c.kind, c.input, c.style);
    }
  };

  it("the fixture holds the inputs it exists for", () => {
    expect(fx.editorText.trim().split(/\s+/)).toHaveLength(60); // draftFeedback("tail") needs 25 words or more
    expect(fx.longEditorText.length).toBeGreaterThan(2000); // so the tail's cut at 2,000 characters bites
    expect(fx.question).toHaveLength(2500); // so buildChatPrompt's cut at 2,000 bites
    expect(new Set(fx.cases.map((c) => (c.entry === "askAI" ? c.entry : `${c.entry}/${c.kind}`)))).toEqual(
      new Set(["continueWriting/continue", "improveText/improve", "makeLonger/expand", "draftFeedback/tail", "draftFeedback/improve", "draftFeedback/expand", "askAI"]),
    );
    expect(fx.cases.filter((c) => c.entry === "askAI").map((c) => c.field)).toEqual(["psychology", "education"]);
    expect(fx.cases.filter((c) => c.input === fx.longEditorText.slice(-2000)).map((c) => c.id)).toEqual(["continueWriting-long", "draftFeedback-tail-long"]);
    expect(fx.cases.filter((c) => c.style !== "").map((c) => c.id)).toEqual(["continueWriting-style", "improveText-style", "makeLonger-style"]);
    expect(fx.cases.every((c) => !c.draftFirst)).toBe(true); // the writing entries hand over to draftFeedback only when draft-first is on
  });
  it("PLAIN_OUT and the content-language instruction", () => {
    expect(PLAIN_OUT).toBe(fx.plainOut);
    expect(contentLangInstruction("hi")).toBe(fx.hiInstruction);
    expect(contentLangInstruction("en")).toBe(fx.enInstruction);
  });
  it("v1 builds each prompt from the editor text (the tail is its last 2,000 characters, a selection is all of it) or from the typed question", () => {
    const tails = [fx.editorText.slice(-2000), fx.longEditorText.slice(-2000)];
    for (const c of fx.cases) {
      if (c.entry === "askAI") expect(c.input).toBe(fx.question);
      else if (c.kind === "continue" || c.kind === "tail") expect(tails).toContain(c.input);
      else expect(c.input).toBe(fx.editorText);
    }
  });
  for (const c of fx.cases) {
    it(c.id, () => {
      const b = built(c);
      expect(b.prompt).toBe(c.prompt);
      expect(b.temp).toBe(c.opts.temp);
      expect(b.max).toBe(c.opts.max);
    });
  }
});

describe("v1import.ts reads what v1 exports", () => {
  type Decided = { repaired: boolean; html: boolean };
  type Doc = Decided & { id: string; title: string; updated: number; body: string; v1Html: string };
  type BodyCase = Decided & { id: string; body: string; out: string };
  type Bundle = { app: string; v: number; exported: string; data: Record<string, string> };
  type StoredProject = { id: string; name: string; stage: string };

  /** The way a body comes out, from what v1 decided about it (3143-3148: repaired, then looks like HTML) and what its output keeps. */
  type Kind = "html" | "plain" | "escaped picture" | "appuimg";
  const kindOf = (c: Decided, v1Html: string): Kind => (c.repaired ? "escaped picture" : !c.html ? "plain" : /\bsrc=(["'])appuimg:/.test(v1Html) ? "appuimg" : "html");

  /**
   * `v1Html` is v1's bodyToHTML of `body`; `got` is v1BodyToHtml of it. An HTML-looking body: v1 passes it on unchanged and both end in sanitizeHtml. The three differences of
   * D-W0-5 are pinned here with the register's own words: a plain body gets a <p> wrapper, an escaped picture is repaired by v1 and not by v2, an appuimg: reference is kept by v1
   * (its picture store resolves it) and lost to v2's sanitiser, which allows only http, https, mailto and base64 images in src.
   */
  const pin = (kind: Kind, body: string, v1Html: string, got: string) => {
    switch (kind) {
      case "html":
        expect(v1Html).toBe(body);
        expect(got).toBe(sanitizeHtml(v1Html));
        break;
      case "plain":
        expect(got).toBe(sanitizeHtml("<p>" + v1Html + "</p>"));
        break;
      case "escaped picture": {
        const repaired = sanitizeHtml(v1Html);
        expect(got).not.toBe(repaired);
        expect(repaired).toContain('<span class="img-wrap"');
        expect(repaired).toContain('<img src="data:image/png;base64,');
        expect(got).not.toContain('<span class="img-wrap"');
        expect(got).not.toContain("<img");
        expect(got).toMatch(/&(?:amp;)*lt;span class="img-wrap"/); // the damage v1 mends (3136) is still there, as text
        break;
      }
      case "appuimg":
        expect(v1Html).toMatch(/\bsrc=(["'])appuimg:/);
        expect(got).not.toBe(v1Html);
        expect(got).toBe(sanitizeHtml(v1Html));
        expect(got).not.toContain("appuimg:");
        expect(got).toContain("<img");
        break;
    }
  };
  const label = (kind: Kind) => (kind === "plain" ? "D-W0-5: wrapped in <p>" : kind === "escaped picture" ? "D-W0-5: v1 repairs the picture, v2 does not" : kind === "appuimg" ? "D-W0-5: v1 keeps the reference, v2 drops the src" : "equal");

  const bundle = readFixture<{ bundle: Bundle; docs: Doc[] }>("v1import", "bundle");
  const bodies = readFixture<{ cases: BodyCase[] }>("v1import", "bodies");
  const parsed = () => {
    const r = parseV1Backup(JSON.stringify(bundle.bundle));
    if (!r.ok) throw new Error(`parseV1Backup refused v1's own bundle: ${r.reason}`);
    return r.backup;
  };

  it("the bundle is the file backupExport writes, without the AI key, and its four documents take the four paths", () => {
    expect(bundle.bundle.app).toBe("appuscholar");
    expect(bundle.bundle.v).toBe(1);
    expect(Object.keys(bundle.bundle.data)).toEqual(expect.arrayContaining(["appu_docs", "appu_projects", "appu_theme"]));
    expect(bundle.bundle.data).not.toHaveProperty("appu_key_gemini");
    expect(new Set(bundle.docs.map((d) => kindOf(d, d.v1Html)))).toEqual(new Set(["html", "plain", "appuimg", "escaped picture"]));
  });
  it("parses v1's own bundle: exported stamp, titles, ids, dates and order, and the projects under their v1 field name", () => {
    const b = parsed();
    expect(b.exported).toBe(bundle.bundle.exported);
    expect(b.documents.map((d) => d.title)).toEqual(bundle.docs.map((d) => d.title));
    expect(b.documents.map((d) => d.id)).toEqual(bundle.docs.map((d) => d.id));
    expect(b.documents.map((d) => d.updated)).toEqual(bundle.docs.map((d) => d.updated));
    // v1 saves a project as {id, name, stage, pack, status, createdAt, updatedAt} (2896); v2 calls the name `title`.
    const stored = JSON.parse(bundle.bundle.data.appu_projects ?? "[]") as StoredProject[];
    expect(stored.length).toBeGreaterThanOrEqual(2);
    expect(b.projects).toEqual(stored.map((p) => ({ id: p.id, title: p.name, stage: p.stage })));
  });
  for (const [i, d] of bundle.docs.entries()) {
    const kind = kindOf(d, d.v1Html);
    it(`bundle document "${d.title}" (${kind}) ${label(kind)}`, () => pin(kind, d.body, d.v1Html, parsed().documents[i]?.bodyHtml ?? "(no document)"));
  }

  it("the bodies fixture holds a case per tag of looksLikeStoredHTML, and the plain, escaped-picture and appuimg shapes", () => {
    const tags = bodies.cases.filter((c) => c.id.startsWith("tag-"));
    expect(tags.length).toBeGreaterThanOrEqual(30);
    expect(tags.every((c) => kindOf(c, c.out) === "html")).toBe(true);
    const kinds = bodies.cases.map((c) => kindOf(c, c.out));
    expect(kinds.filter((k) => k === "plain").length).toBeGreaterThanOrEqual(10);
    expect(kinds.filter((k) => k === "escaped picture").length).toBeGreaterThanOrEqual(3);
    expect(kinds.filter((k) => k === "appuimg").length).toBeGreaterThanOrEqual(2);
  });
  for (const c of bodies.cases) {
    const kind = kindOf(c, c.out);
    it(`bodyToHTML ${c.id} (${kind}) ${label(kind)}`, () => pin(kind, c.body, c.out, v1BodyToHtml(c.body)));
  }
  // The two things the plain-body pin above takes for granted, stated for the register: where v1 and v2 write the text differently before sanitising, and what an empty body becomes.
  const bodyCase = (id: string) => {
    const c = bodies.cases.find((x) => x.id === id);
    if (!c) throw new Error(`no body case ${id}`);
    return c;
  };
  it("D-W0-5 plain-entities: v1 escapes the quotes (&quot; and &#39;), v2's output has them plain, and nothing else differs", () => {
    const c = bodyCase("plain-entities");
    expect(c.out).toContain("&quot;x&quot;");
    expect(c.out).toContain("it&#39;s");
    const got = v1BodyToHtml(c.body);
    expect(got).toContain('"x"');
    expect(got).toContain("it's");
    expect(got).toBe(sanitizeHtml("<p>" + c.out + "</p>"));
  });
  it("D-W0-5 plain-empty: v1 returns an empty string for an empty body, v2 an empty paragraph", () => {
    const c = bodyCase("plain-empty");
    expect(c.body).toBe("");
    expect(c.out).toBe("");
    expect(v1BodyToHtml(c.body)).toBe("<p></p>");
  });
});

describe("v1locked.ts opens what v1 locks", () => {
  type LockedFile = { locked: { app: string; v: number; locked: boolean; enc: { iter: number; z: number } }; plain: string; pass: string };
  for (const [file, z] of [["locked-gzip", 1], ["locked-plain", 0]] as const) {
    it(file, async () => {
      const fx = readFixture<LockedFile>("v1locked", file);
      expect(fx.locked.enc.z).toBe(z); // v1 compressed the one file and not the other
      expect(fx.locked.enc.iter).toBe(600000); // the rounds v1 ships
      const text = JSON.stringify(fx.locked);
      expect(isLockedV1Backup(text)).toBe(true);
      expect(await unlockV1Backup(text, fx.pass)).toEqual({ ok: true, text: fx.plain });
      expect(await unlockV1Backup(text, fx.pass + "x")).toEqual({ ok: false, reason: "wrong-passphrase" });
    }, 30_000);
  }
});
