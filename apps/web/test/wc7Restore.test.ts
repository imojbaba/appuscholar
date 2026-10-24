import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: (...a: unknown[]) => h.apiFetch(...a) }));

import { BackupError } from "../lib/help/backup/format";
import { lockBackup } from "../lib/help/backup/lockedBackup";
import { apiRestoreDeps, bodyOf, restoreBackup } from "../lib/help/backup/restore";
import { BLOBS, CITES, DOCS, IDEA, PAPER, PREFS, apiError, fakeServer, fakeVault, fixtureZip, type Call } from "./wc7Support";

const SUFFIX = "(restored)";
const PASS = "a long enough passphrase";
const deps = (vault = fakeVault().vault) => apiRestoreDeps(vault, { suffix: SUFFIX, authorLabel: "Restored backup" });
const code = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e instanceof BackupError ? e.code : "other:" + String(e); } };
const docPosts = (calls: Call[]) => calls.filter((c) => c.method === "POST" && /\/documents$/.test(c.path));
const projectPosts = (calls: Call[]) => calls.filter((c) => c.method === "POST" && c.path === "/projects");
const blobPuts = (calls: Call[]) => calls.filter((c) => c.method === "PUT");
function serve(o: Parameters<typeof fakeServer>[0] = {}) { const s = fakeServer(o); h.apiFetch.mockReset(); h.apiFetch.mockImplementation(s.apiFetch); return s; }
async function mutate(bytes: Uint8Array, fn: (z: JSZip) => void | Promise<void>) { const z = await JSZip.loadAsync(bytes); await fn(z); return new Uint8Array(await z.generateAsync({ type: "arraybuffer" })); }

beforeEach(() => { h.apiFetch.mockReset(); });

describe("restoreBackup (Task C7): what it makes", () => {
  it("round trip: the same titles plus (restored), the same document HTML and the same stage data", async () => {
    const s = serve();
    const r = (await restoreBackup(await fixtureZip(), undefined, deps()))!;
    expect(r.failed).toEqual([]);
    expect(r.projects.map((p) => [p.title, p.documents])).toEqual([["Sleep study (restored)", 2], ["Reading log (restored)", 1]]);
    expect(r.projects.map((p) => p.id)).toEqual(s.made);
    expect(projectPosts(s.calls).map((c) => c.body)).toEqual([{ title: "Sleep study (restored)", titleKeyVersion: 0 }, { title: "Reading log (restored)", titleKeyVersion: 0 }]);
    const docs = docPosts(s.calls);
    expect(docs.map((c) => [c.path, c.body!.title, c.body!.kind, c.body!.bodyHtml, c.body!.keyVersion])).toEqual([
      ["/projects/new-1/documents", "Draft one", "draft", DOCS[0]!.html, 0],
      ["/projects/new-1/documents", "Draft two", "draft", DOCS[1]!.html, 0],
      ["/projects/new-2/documents", "A source", "source", DOCS[2]!.html, 0]
    ]);
    const puts = blobPuts(s.calls);
    expect(puts.map((c) => [c.path, JSON.parse(c.body!.body as string), c.body!.keyVersion])).toEqual([
      ["/projects/new-1/blobs/idea_intake", IDEA, 0],
      ["/projects/new-1/blobs/citations", CITES, 0],
      ["/projects/new-2/blobs/rs_prefs", PREFS, 0],
      ["/projects/new-2/blobs/shelf_paper%3Aabc", PAPER, 0]
    ]);
    expect(r.projects.map((p) => p.stageData)).toEqual([2, 2]);
  });

  it("restore adds projects and leaves every existing project untouched: only POSTs of new projects and writes under the new ids", async () => {
    const existing = ["e1", "e2", "p1", "p2"];
    const s = serve();
    const r = (await restoreBackup(await fixtureZip(), undefined, deps()))!;
    expect(r.projects).toHaveLength(2);
    expect(s.calls.length).toBeGreaterThan(0);
    for (const c of s.calls) {
      const ok =
        (c.method === "POST" && c.path === "/projects") ||
        (c.method === "POST" && /^\/projects\/new-\d+\/documents$/.test(c.path)) ||
        (c.method === "PUT" && /^\/projects\/new-\d+\/blobs\/[^/]+$/.test(c.path));
      expect(ok, c.method + " " + c.path).toBe(true);
      for (const id of existing) expect(c.path, c.method + " " + c.path).not.toContain(id);
    }
    expect(s.calls.some((c) => ["PATCH", "DELETE", "GET"].includes(c.method))).toBe(false);
    expect(s.calls.some((c) => c.method === "PUT" && !c.path.includes("/blobs/"))).toBe(false);
    // The ids it wrote under are the ones it made, not the ones the file's folders or the account already had.
    expect(new Set(s.calls.filter((c) => c.path !== "/projects").map((c) => c.path.split("/")[2]))).toEqual(new Set(s.made));
  });

  it("a stage-data write only creates: If-Match 0, so it can never replace a blob that is there", async () => {
    const s = serve();
    await restoreBackup(await fixtureZip(), undefined, deps());
    expect(blobPuts(s.calls).length).toBe(4);
    for (const c of blobPuts(s.calls)) expect(c.headers["if-match"]).toBe('"0"');
  });

  it("restoring the same file twice adds a second set and never touches the first", async () => {
    const s = serve();
    const bytes = await fixtureZip();
    const a = (await restoreBackup(bytes, undefined, deps()))!;
    const b = (await restoreBackup(bytes, undefined, deps()))!;
    expect(a.projects.map((p) => p.id)).toEqual(["new-1", "new-2"]);
    expect(b.projects.map((p) => p.id)).toEqual(["new-3", "new-4"]);
    expect(s.calls.every((c) => c.method === "POST" || c.method === "PUT")).toBe(true);
    const secondRun = s.calls.slice(s.calls.length / 2);
    for (const c of secondRun) expect(c.path).not.toMatch(/new-[12]\b/);
  });

  it("the scratch space: empty, it is not restored (every account has one); with writing in it, it is a normal project named (restored)", async () => {
    const s = serve();
    const none = (await restoreBackup(await fixtureZip(), undefined, deps()))!;
    expect(none.projects.map((p) => p.title)).not.toContain("Scratch space (restored)");
    expect(none.failed).toEqual([]);
    expect(s.made).toHaveLength(2);
    const bytes = await fixtureZip({ scratchDocs: [{ id: "x1", pid: "s0", title: "A note", kind: "draft", html: "<p>Jotted down.</p>" }] });
    const r = (await restoreBackup(bytes, undefined, deps()))!;
    expect(r.projects.map((p) => [p.title, p.documents])).toEqual([["Sleep study (restored)", 2], ["Reading log (restored)", 1], ["Scratch space (restored)", 1]]);
  });

  it("a project with no documents and no stage data is still restored, as an empty project", async () => {
    const s = serve();
    const bytes = await fixtureZip({ docs: [], blobs: {} });
    const r = (await restoreBackup(bytes, undefined, deps()))!;
    expect(r.projects.map((p) => [p.title, p.documents])).toEqual([["Sleep study (restored)", 0], ["Reading log (restored)", 0]]);
    expect(docPosts(s.calls)).toHaveLength(0);
    expect(blobPuts(s.calls)).toHaveLength(0);
  });

  it("document text goes through the sanitiser, as an import's does", async () => {
    const s = serve();
    const bytes = await fixtureZip({ docs: [{ id: "d1", pid: "p1", title: "Draft one", kind: "draft", html: '<p>ok</p><img src="x" onerror="fetch(1)"><script>alert(1)</script>' }] });
    await restoreBackup(bytes, undefined, deps());
    const sent = JSON.stringify(docPosts(s.calls));
    expect(sent).toContain("<p>ok</p>");
    expect(sent).not.toContain("onerror");
    expect(sent).not.toContain("<script");
  });

  it("a long title keeps its (restored) mark and stays within the api's 200 characters", async () => {
    const s = serve();
    const bytes = await fixtureZip({ projects: [{ id: "p1", title: "T".repeat(200), titleKeyVersion: 0, deks: [], stageMarks: {}, draftWords: 0, draftEditedAt: null, createdAt: "2026-09-08T10:00:00.000Z" }], docs: [], blobs: {} });
    const r = (await restoreBackup(bytes, undefined, deps()))!;
    const title = projectPosts(s.calls)[0]!.body!.title as string;
    expect(title.length).toBeLessThanOrEqual(200);
    expect(title.endsWith(" " + SUFFIX)).toBe(true);
    expect(r.projects[0]!.title).toBe(title);
  });

  it("a restored document carries the import mark and the label it was given", async () => {
    const s = serve();
    await restoreBackup(await fixtureZip(), undefined, deps());
    expect(docPosts(s.calls).every((c) => c.body!.authorKind === "import" && c.body!.authorLabel === "Restored backup")).toBe(true);
  });
});

describe("restoreBackup: reading the file", () => {
  it("opens a locked file with its passphrase and restores the same", async () => {
    const s = serve();
    const locked = await lockBackup(await fixtureZip(), PASS);
    const r = (await restoreBackup(locked, PASS, deps()))!;
    expect(r.projects.map((p) => p.title)).toEqual(["Sleep study (restored)", "Reading log (restored)"]);
    expect(docPosts(s.calls)).toHaveLength(3);
  });

  it("a locked restore with a wrong passphrase writes nothing, asks nothing of the vault, and says wrong-passphrase", async () => {
    const s = serve();
    const fv = fakeVault({ known: "unlocked" });
    const locked = await lockBackup(await fixtureZip(), PASS);
    expect(await code(restoreBackup(locked, "not the passphrase!!", deps(fv.vault)))).toBe("wrong-passphrase");
    expect(s.calls).toEqual([]);
    expect(fv.spies.ensureUnlocked).not.toHaveBeenCalled();
    expect(fv.spies.encryptBody).not.toHaveBeenCalled();
  });

  it("a locked file with no passphrase is passphrase-needed, and writes nothing", async () => {
    const s = serve();
    const locked = await lockBackup(await fixtureZip(), PASS);
    expect(await code(restoreBackup(locked, undefined, deps()))).toBe("passphrase-needed");
    expect(await code(restoreBackup(locked, "", deps()))).toBe("passphrase-needed");
    expect(s.calls).toEqual([]);
  });

  it("anything that is not a backup is not-a-backup, and writes nothing", async () => {
    const s = serve();
    const good = await fixtureZip();
    expect(await code(restoreBackup(new TextEncoder().encode("just some words"), undefined, deps()))).toBe("not-a-backup");
    expect(await code(restoreBackup(await mutate(good, (z) => { z.remove("index.json"); }), undefined, deps()))).toBe("not-a-backup");
    expect(await code(restoreBackup(await mutate(good, (z) => { z.file("index.json", "{not json"); }), undefined, deps()))).toBe("not-a-backup");
    expect(await code(restoreBackup(await mutate(good, (z) => { z.file("index.json", JSON.stringify({ hello: 1 })); }), undefined, deps()))).toBe("not-a-backup");
    expect(await code(restoreBackup(await lockBackup(new TextEncoder().encode("not a zip at all"), PASS), PASS, deps()))).toBe("not-a-backup");
    expect(s.calls).toEqual([]);
  });

  it("reads a document file with or without the wrapper Export all my work puts around it", () => {
    expect(bodyOf('<!doctype html>\n<html><head><meta charset="utf-8"><title>A &amp; B</title></head><body>\n<p>One</p>\n<p>Two</p>\n</body></html>\n')).toBe("<p>One</p>\n<p>Two</p>");
    expect(bodyOf("<p>A bare fragment.</p>")).toBe("<p>A bare fragment.</p>");
    expect(bodyOf("")).toBe("");
  });
});

describe("restoreBackup: a part that cannot be restored is reported, nothing is removed", () => {
  it("a document file missing from the zip, an unreadable document and unreadable stage data are listed as not restored; the rest is restored", async () => {
    const s = serve();
    const bytes = await mutate(await fixtureZip({ docs: [...DOCS, { id: "d3", pid: "p1", title: "Draft three", kind: "draft", html: "<p>x</p>", unreadable: true }], blobs: BLOBS }), (z) => { z.remove("Sleep study/Draft two.html"); });
    const r = (await restoreBackup(bytes, undefined, deps()))!;
    expect(r.failed).toEqual(["missing:Sleep study/Draft two.html", "unreadable:Sleep study/Draft three"]);
    expect(r.projects.map((p) => [p.title, p.documents])).toEqual([["Sleep study (restored)", 1], ["Reading log (restored)", 1]]);
    expect(s.calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  it("stage data that was unreadable when the backup was made is listed once, by project", async () => {
    serve();
    const r = (await restoreBackup(await fixtureZip({ badBlobText: "not json at all" }), undefined, deps()))!;
    expect(r.failed).toEqual(["unreadable-stage:Sleep study"]);
    expect(r.projects[0]!.stageData).toBe(1);
  });

  it("stage data of a kind this version does not know, or not of its kind's shape, is not written and is listed once for its project", async () => {
    const s = serve();
    const blobs = { p1: [{ kind: "idea_intake", value: { topic: 5 } }, { kind: "citations", value: CITES }], p2: [] };
    const r = (await restoreBackup(await fixtureZip({ blobs }), undefined, deps()))!;
    expect(r.failed).toEqual(["stage:Sleep study"]);
    expect(blobPuts(s.calls).map((c) => c.path)).toEqual(["/projects/new-1/blobs/citations"]);
    const z = await JSZip.loadAsync(await fixtureZip({ blobs: { p1: [{ kind: "idea_intake", value: IDEA }], p2: [] } }));
    const idx = JSON.parse(await z.file("index.json")!.async("string"));
    idx.projects[0].stageData[0].kind = "from_a_newer_build";
    z.file("index.json", JSON.stringify(idx));
    serve();
    const r2 = (await restoreBackup(new Uint8Array(await z.generateAsync({ type: "arraybuffer" })), undefined, deps()))!;
    expect(r2.failed).toEqual(["stage:Sleep study"]);
  });

  it("a half-failing write reports what was made and what was not, and removes nothing: a document the api refuses is skipped and the rest go on", async () => {
    const s = serve({ fail: (c) => (c.method === "POST" && c.path.endsWith("/documents") && c.body?.title === "Draft two" ? apiError(413, "too-large") : undefined) });
    const r = (await restoreBackup(await fixtureZip(), undefined, deps()))!;
    expect(r.projects.map((p) => [p.title, p.documents, p.stageData])).toEqual([["Sleep study (restored)", 1, 2], ["Reading log (restored)", 1, 2]]);
    expect(r.failed).toEqual(["document:Sleep study/Draft two"]);
    expect(s.calls.some((c) => c.method === "DELETE" || c.method === "PATCH")).toBe(false);
  });

  it("a failure that will repeat (the api is down, the session ended) stops the run: what was made stays, the rest is listed as not tried", async () => {
    const s = serve({ fail: (c) => (c.method === "POST" && c.path.endsWith("/documents") && c.body?.title === "Draft two" ? apiError(503) : undefined) });
    const r = (await restoreBackup(await fixtureZip(), undefined, deps()))!;
    expect(r.projects.map((p) => [p.title, p.documents])).toEqual([["Sleep study (restored)", 1]]);
    expect(r.failed).toEqual(["document:Sleep study/Draft two", "rest:Sleep study", "skipped:Reading log"]);
    expect(s.calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(docPosts(s.calls).map((c) => c.body!.title)).toEqual(["Draft one", "Draft two"]);
    expect(blobPuts(s.calls)).toHaveLength(0);
  });

  it("a network failure (no answer at all) stops the run the same way", async () => {
    const s = serve({ fail: (c) => (c.method === "POST" && c.path === "/projects" && c.body?.title === "Reading log (restored)" ? new TypeError("Failed to fetch") : undefined) });
    const r = (await restoreBackup(await fixtureZip(), undefined, deps()))!;
    expect(r.projects.map((p) => p.title)).toEqual(["Sleep study (restored)"]);
    expect(r.failed).toEqual(["project:Reading log"]);
    expect(s.calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  it("a project the api will not create is listed, with its parts not tried, and the next project goes on when the refusal is its own", async () => {
    const s = serve({ fail: (c) => (c.method === "POST" && c.path === "/projects" && c.body?.title === "Sleep study (restored)" ? apiError(400, "invalid") : undefined) });
    const r = (await restoreBackup(await fixtureZip(), undefined, deps()))!;
    expect(r.failed).toEqual(["project:Sleep study"]);
    expect(r.projects.map((p) => [p.title, p.documents])).toEqual([["Reading log (restored)", 1]]);
    expect(docPosts(s.calls).map((c) => c.path)).toEqual(["/projects/new-1/documents"]);
  });
});

describe("restoreBackup: the vault", () => {
  it("vault on, unlocked: every title, body and stage-data value is sealed before it is sent, and no plain text reaches the api", async () => {
    const s = serve();
    const fv = fakeVault({ known: "unlocked" });
    const r = (await restoreBackup(await fixtureZip(), undefined, deps(fv.vault)))!;
    expect(r.failed).toEqual([]);
    const sent = JSON.stringify(s.calls.map((c) => c.body));
    for (const plain of ["Sleep study", "Reading log", "Draft one", "Draft two", "A source", "Invented sentence", "bold", "Does sleep help memory", "made-up paper", "Page one"]) expect(sent, plain).not.toContain(plain);
    for (const c of projectPosts(s.calls)) expect(c.body).toMatchObject({ titleKeyVersion: 1, dek: { v: 1, wrapped: "wrapped-dek" } });
    for (const c of docPosts(s.calls)) expect(c.body).toMatchObject({ keyVersion: 1, titleKeyVersion: 1, dek: { v: 1, wrapped: "wrapped-dek" }, kind: expect.stringMatching(/^(draft|source)$/) });
    for (const c of blobPuts(s.calls)) expect(c.body).toMatchObject({ keyVersion: 1, dek: { v: 1, wrapped: "wrapped-dek" } });
    // What it sealed: the titles under a new project's key, the blobs under blob:<new id>:<kind>, the text itself.
    const ids = fv.sealed.map((x) => x.id);
    expect(ids.filter((i) => i.startsWith("project:new:"))).toHaveLength(2);
    expect(ids).toContain("blob:new-1:idea_intake");
    expect(ids).toContain("blob:new-2:shelf_paper:abc");
    expect(fv.sealed.map((x) => x.text)).toEqual(expect.arrayContaining(["Sleep study (restored)", "Draft one", DOCS[0]!.html, JSON.stringify(IDEA)]));
  });

  it("a locked vault is asked to unlock first, before anything is written", async () => {
    const s = serve();
    const fv = fakeVault({ known: "locked", unlock: true });
    fv.spies.ensureUnlocked.mockImplementation(async () => { expect(s.calls).toEqual([]); return true; });
    const r = (await restoreBackup(await fixtureZip(), undefined, deps(fv.vault)))!;
    expect(fv.spies.ensureUnlocked).toHaveBeenCalledTimes(1);
    expect(r.projects).toHaveLength(2);
  });

  it("if the student cancels the unlock, nothing is written and the answer is null", async () => {
    const s = serve();
    const fv = fakeVault({ known: "locked", unlock: false });
    expect(await restoreBackup(await fixtureZip(), undefined, deps(fv.vault))).toBeNull();
    expect(s.calls).toEqual([]);
    expect(fv.spies.encryptBody).not.toHaveBeenCalled();
  });

  it("vault off: the vault is not asked for anything and nothing is sealed", async () => {
    serve();
    const fv = fakeVault({ known: "off" });
    await restoreBackup(await fixtureZip(), undefined, deps(fv.vault));
    expect(fv.spies.ensureUnlocked).not.toHaveBeenCalled();
    expect(fv.spies.encryptBody).not.toHaveBeenCalled();
  });

  it("the vault locking part-way stops the run and lists the rest as not tried", async () => {
    const s = serve();
    const fv = fakeVault({ known: "unlocked" });
    let n = 0;
    fv.spies.encryptBody.mockImplementation(async (d: { id: string; deks: unknown[] }, text: string) => {
      if (++n > 3) throw new Error("vault-locked");
      fv.sealed.push({ id: d.id, text });
      return { bodyHtml: "sealed" + n + ".xxxxxxxxxxxxxxxxxxxx", keyVersion: 1, ...(d.deks.length ? {} : { dek: { v: 1, wrapped: "wrapped-dek" } }) };
    });
    const r = (await restoreBackup(await fixtureZip(), undefined, deps(fv.vault)))!;
    expect(r.projects.map((p) => p.title)).toEqual(["Sleep study (restored)"]);
    expect(r.failed.some((f) => f.startsWith("rest:Sleep study"))).toBe(true);
    expect(r.failed).toContain("skipped:Reading log");
    expect(s.calls.some((c) => c.method === "DELETE")).toBe(false);
  });
});
