import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseV1Backup, chunkV1Documents } from "../src/v1import";

const fixture = readFileSync(new URL("./fixtures/v1-backup-small.json", import.meta.url), "utf8");

describe("parseV1Backup", () => {
  it("rejects non-JSON", () => {
    expect(parseV1Backup("not json")).toEqual({ ok: false, reason: "not-json" });
  });
  it("rejects JSON that is not an Appuscholar bundle", () => {
    expect(parseV1Backup(JSON.stringify({ hello: 1 }))).toEqual({ ok: false, reason: "not-appuscholar" });
  });
  it("rejects a bundle with no documents", () => {
    expect(parseV1Backup(JSON.stringify({ app: "appuscholar", v: 1, data: { appu_docs: "[]" } }))).toEqual({ ok: false, reason: "no-documents" });
  });
  it("parses documents and projects, sanitises HTML, wraps plain text", () => {
    const r = parseV1Backup(fixture);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.exported).toBe("2026-10-12T09:30:00.000Z");
    expect(r.backup.projects).toEqual([{ id: "p1", title: "Sleep and memory", stage: "lit" }]);
    expect(r.backup.documents).toHaveLength(2);
    const [lit, notes] = r.backup.documents;
    expect(lit?.title).toBe("Literature review");
    expect(lit?.bodyHtml).toContain("<b>matters</b>");
    expect(lit?.bodyHtml).not.toContain("onerror");
    expect(notes?.bodyHtml).toBe("<p>line one<br>line two</p>");
  });
});

describe("chunkV1Documents", () => {
  const doc = (title: string, size: number) => ({ title, bodyHtml: "x".repeat(size) });
  it("keeps every batch under the byte limit and preserves order", () => {
    const docs = [doc("a", 40), doc("b", 40), doc("c", 40), doc("d", 10)];
    const chunks = chunkV1Documents(docs, 100);
    expect(chunks.map(c => c.map(d => d.title))).toEqual([["a", "b"], ["c", "d"]]);
  });
  it("puts an oversized document alone in its own batch", () => {
    const chunks = chunkV1Documents([doc("a", 10), doc("big", 500), doc("c", 10)], 100);
    expect(chunks.map(c => c.map(d => d.title))).toEqual([["a"], ["big"], ["c"]]);
  });
  it("counts UTF-8 bytes, not characters", () => {
    const chunks = chunkV1Documents([{ title: "a", bodyHtml: "é".repeat(30) }, { title: "b", bodyHtml: "é".repeat(30) }], 100);
    expect(chunks).toHaveLength(2);
  });
  it("returns no batches for no documents", () => {
    expect(chunkV1Documents([], 100)).toEqual([]);
  });
});
