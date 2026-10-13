import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseV1Backup } from "../src/v1import";

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
