// @vitest-environment jsdom
import JSZip from "jszip";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { qualBuildMarkdown, type QualCode } from "@appuscholar/core";
import en from "../messages/en.json";
import qualEn from "../messages/tools/qual.en.json";
import qualHi from "../messages/tools/qual.hi.json";
import { exportPartList, moduleExportParts } from "../lib/export/moduleParts";
import { exportProject, type ProjectExportDeps } from "../lib/export/projectExport";
import type { ProjectDocument } from "../lib/editor/docAccess";
import { findPassages } from "../lib/tools/qual/passages";
import { VaultError } from "../lib/vault/crypto";
import type { OpenedTitle, Titled } from "../lib/vault/titles";
import type { ExportPartDef } from "../lib/tools/registry";

/*
 * Task C3: "Export all coded passages (Markdown)" (v1 qualExportMarkdown 6311-6340) as the Panel's button and as the module's part of the project export
 * ("qual/appuscholar-coded-passages-DATE.md"), both made by core's qualBuildMarkdown over the passages found in the documents. No code colour is in any export (R4).
 * useProjectBlob is a plain store, docAccess is a fake, the download is a spy.
 */

type Snap = { value: unknown; loading: boolean; locked: boolean; broken?: boolean };
const h = vi.hoisted(() => ({
  blobs: {} as Record<string, Snap>,
  access: {} as Record<string, unknown>,
  documents: [] as Array<{ id: string }>,
  download: vi.fn()
}));
vi.mock("@/lib/blobs/useProjectBlob", async () => {
  const { useState } = await import("react");
  return {
    useProjectBlob: (kind: string) => {
      const [snap, setSnap] = useState<Snap>(() => h.blobs[kind]!);
      return {
        ...snap,
        set: (next: unknown) => {
          const value = typeof next === "function" ? (next as (p: unknown) => unknown)(snap.value) : next;
          h.blobs[kind] = { ...h.blobs[kind]!, value };
          setSnap((s) => ({ ...s, value }));
        },
        flush: async () => true,
        readOnly: false
      };
    }
  };
});
vi.mock("@/lib/editor/docAccess", () => ({ useDocAccess: () => h.access }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ documents: h.documents }) }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: "unlocked" }) }));
vi.mock("@/lib/export/download", () => ({ downloadBlob: h.download }));

import { Panel } from "../components/tools/qual/Panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = { ...(en as Record<string, string>), ...(qualEn as Record<string, string>) };
const roots: Root[] = [];
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
async function render(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(node); });
}
async function click(id: string) {
  const el = tid(id);
  if (!el) throw new Error("no element " + id);
  await act(async () => { el.click(); });
}
/** A blob's text (jsdom's Blob has no text()). */
const blobText = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(r.error);
  r.readAsText(b);
});
const blobBuffer = (b: Blob) => new Promise<ArrayBuffer>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result as ArrayBuffer);
  r.onerror = () => rej(r.error);
  r.readAsArrayBuffer(b);
});
const status = () => tid("qual-status")!.textContent;
const C = (id: string, name: string, parentId: string | null, color = "#f59e0b"): QualCode => ({ id, name, parentId, color });
const tag = (id: string, text: string) => `<span class="qual-tag" data-qcode="${id}" title="x">${text}</span>`;

const NOW = new Date(2026, 9, 21, 14, 30);
const DAY = "2026-10-21";
const NAME = `appuscholar-coded-passages-${DAY}.md`;

// Coping, a code with no passages, and a sub-code of Coping. The first passage has a newline and runs of spaces, which the Markdown collapses.
const TREE: QualCode[] = [C("qa", "Coping", null), C("qb", "Barriers", null, "#10b981"), C("qc", "Social support", "qa", "#3b82f6")];
const DOCS: ProjectDocument[] = [
  { id: "d1", title: "Interview one", text: "", html: `<p>I felt ${tag("qa", "anxious   and\n tired")} before.</p><p>${tag("qa", "  second  ")}</p><p>${tag("qc", "my sister helped")}</p>` },
  { id: "d2", title: "Interview two", text: "", html: `<p>${tag("qc", "friends")} and ${tag("qa", "walking")}</p><p>${tag("zz", "orphan code")}</p>` }
];
const EXPECTED = [
  "# Coded passages",
  "",
  "## Coping",
  '- **Interview one:** "anxious and tired"',
  '- **Interview one:** "second"',
  '- **Interview two:** "walking"',
  "",
  "### Social support",
  '- **Interview one:** "my sister helped"',
  '- **Interview two:** "friends"',
  "",
  "## Barriers",
  "_No passages tagged yet._",
  ""
].join("\n");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  h.blobs = { qual_codes: { value: TREE, loading: false, locked: false }, qual_prefs: { value: null, loading: false, locked: false } };
  h.documents = DOCS.map((d) => ({ id: d.id }));
  h.download.mockReset();
  h.access = { wrapSelection: vi.fn(), allDocuments: vi.fn(async () => DOCS), rewriteDocument: vi.fn(async () => true) };
});
afterEach(() => { vi.useRealTimers(); act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("the Export button", () => {
  it("downloads qualBuildMarkdown over the passages of the documents, as appuscholar-coded-passages-DATE.md", async () => {
    await render(<Panel tab="coding" projectId="p1" />);
    expect(tid("qual-export")!.textContent).toBe("Export all coded passages (Markdown)");
    await click("qual-export");
    expect(h.download).toHaveBeenCalledTimes(1);
    const [name, blob] = h.download.mock.calls[0] as [string, Blob];
    expect(name).toBe(NAME);
    expect(blob.type).toBe("text/markdown;charset=utf-8");
    const md = await blobText(blob);
    expect(md).toBe(EXPECTED);
    // The same text as the engine's, over the same passages: the panel does not reimplement it.
    expect(md).toBe(qualBuildMarkdown(TREE, (id) => findPassages(DOCS, id)));
  });

  it("names the file by the local day just after midnight (not the UTC day)", async () => {
    vi.setSystemTime(new Date(2026, 0, 1, 0, 30));
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-export");
    expect((h.download.mock.calls[0] as [string, Blob])[0]).toBe("appuscholar-coded-passages-2026-01-01.md");
  });

  it("caps the heading level at ###### for deep sub-codes", async () => {
    const deep = [C("a", "L0", null), C("b", "L1", "a"), C("c", "L2", "b"), C("d", "L3", "c"), C("e", "L4", "d"), C("f", "L5", "e")];
    h.blobs.qual_codes = { value: deep, loading: false, locked: false };
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-export");
    const md = await blobText((h.download.mock.calls[0] as [string, Blob])[1]);
    expect(md.split("\n").filter((l) => l.startsWith("#"))).toEqual(["# Coded passages", "## L0", "### L1", "#### L2", "##### L3", "###### L4", "###### L5"]);
  });

  it("with no codes it says so in the status line and downloads nothing", async () => {
    h.blobs.qual_codes = { value: null, loading: false, locked: false };
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-export");
    expect(status()).toBe("Add at least one code first");
    expect(h.download).not.toHaveBeenCalled();
    expect(h.access.allDocuments).not.toHaveBeenCalled();
  });

  it("does not export a damaged code list (no button, the tree's own message)", async () => {
    h.blobs.qual_codes = { value: [C("a", "Loop", "a")], loading: false, locked: false };
    await render(<Panel tab="coding" projectId="p1" />);
    expect(tid("qual-damaged")).not.toBeNull();
    expect(tid("qual-export")).toBeNull();
    expect(h.download).not.toHaveBeenCalled();
  });

  it("is off while the codes are locked or cannot be opened", async () => {
    h.blobs.qual_codes = { value: null, loading: false, locked: true };
    await render(<Panel tab="coding" projectId="p1" />);
    expect((tid("qual-export") as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not export when a document of the project could not be read (it would leave its passages out), and says so", async () => {
    h.documents = [...DOCS.map((d) => ({ id: d.id })), { id: "d3" }];
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-export");
    expect(h.download).not.toHaveBeenCalled();
    expect(status()).toBe(E.qual_status_export_unread);
  });

  it("a failing read of the documents is the same refusal, never a crash", async () => {
    h.access.allDocuments = vi.fn(async () => { throw new Error("offline"); });
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-export");
    expect(h.download).not.toHaveBeenCalled();
    expect(status()).toBe(E.qual_status_export_unread);
  });

  it("never changes the documents or the codes", async () => {
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-export");
    expect(h.access.rewriteDocument).not.toHaveBeenCalled();
    expect(h.access.wrapSelection).not.toHaveBeenCalled();
    expect(h.blobs.qual_codes!.value).toBe(TREE);
  });

  it("the new copy has English and Hindi, and no emoji or em-dash", () => {
    const keys = ["qual_export_none", "qual_status_export_unread", "qual_part_label", "qual_part_detail", "qual_part_format"];
    for (const k of keys) {
      const en1 = (qualEn as Record<string, string>)[k];
      const hi1 = (qualHi as Record<string, string>)[k];
      expect(en1, k).toBeTruthy();
      expect(hi1, k).toBeTruthy();
      expect(`${en1}${hi1}`).not.toMatch(/\p{Extended_Pictographic}|—/u);
    }
  });
});

/** The project export's reads for a project with these documents (each `sealed:` one is opened by decrypt; "bad" does not open). */
const LIST = [
  { id: "d1", title: "Interview one", titleKeyVersion: 0, deks: [], kind: "draft", createdAt: "2026-10-01", updatedAt: "" },
  { id: "d2", title: "Interview two", titleKeyVersion: 0, deks: [], kind: "draft", createdAt: "2026-10-02", updatedAt: "" },
  { id: "bad", title: "Locked", titleKeyVersion: 0, deks: [], kind: "draft", createdAt: "2026-10-03", updatedAt: "" },
  { id: "gone", title: "Deleted", titleKeyVersion: 0, deks: [], kind: "draft", createdAt: "2026-10-04", updatedAt: "", deletedAt: "2026-10-05" }
];
async function fakeOpenTitle(t: Titled): Promise<OpenedTitle> { return { state: "open", text: t.title }; }
function deps(over: Partial<ProjectExportDeps> = {}): ProjectExportDeps {
  return {
    project: { id: "p1", title: "Study", titleKeyVersion: 0, deks: [] },
    // The copy, with its {variables}: the unreadable lines are read as the student reads them.
    t: (k, v) => (E[k] ?? k).replace(/\{(\w+)\}/g, (_m, n: string) => String(v?.[n] ?? "")),
    listDocuments: async () => [...LIST].reverse(),
    getDocument: async (id) => ({ id, bodyHtml: "", keyVersion: 1, deks: [] }),
    decrypt: async (doc) => {
      if (doc.id === "bad") throw new VaultError("corrupt");
      return DOCS.find((d) => d.id === doc.id)!.html;
    },
    openTitle: fakeOpenTitle,
    readBlob: async (kind) => (kind === "qual_codes" ? JSON.stringify(TREE) : null),
    writingRecord: async () => { throw new Error("not read"); },
    aiUseLog: async () => [],
    ...over
  };
}
/** The documents that all open. */
const GOOD = { listDocuments: async () => [LIST[0]!, LIST[1]!] };
const qualPart = (): ExportPartDef => {
  const p = exportPartList().find((x): x is ExportPartDef => typeof x !== "string" && x.part === "qual");
  if (!p) throw new Error("no qual part");
  return p;
};
const build = (over: Partial<ProjectExportDeps> = {}) => qualPart().build({ ...deps(over), now: NOW });

describe("the module's export part", () => {
  it("is ticked, labelled by the module's own keys, and its id collides with nothing", () => {
    expect(() => moduleExportParts()).not.toThrow();
    expect(() => exportPartList()).not.toThrow();
    const p = qualPart();
    expect(p.ticked).toBe(true);
    expect(moduleExportParts().filter((x) => x.part === "qual")).toHaveLength(1);
    expect(E[p.labelKey]).toBe("Coded passages");
    expect(E[p.detailKey]).toBe("Your codes and every passage you tagged, as Markdown");
    expect(E[p.formatKey]).toBe("Markdown");
  });

  it("builds one file, qual/appuscholar-coded-passages-DATE.md, with the same Markdown (documents in creation order, deleted and unreadable ones left out)", async () => {
    const files = await build();
    expect(files.map((f) => f.path)).toEqual([`qual/${NAME}`, "qual/unreadable.txt"]);
    expect(files[0]!.data).toBe(EXPECTED);
  });

  it("gives the day by the local calendar of d.now", async () => {
    const late = new Date(2026, 11, 31, 23, 59);
    const files = await qualPart().build({ ...deps(GOOD), now: late });
    expect(files.map((f) => f.path)).toEqual(["qual/appuscholar-coded-passages-2026-12-31.md"]);
  });

  it("builds nothing, and says nothing, when there are no codes: none stored, or an empty list", async () => {
    expect(await build({ readBlob: async () => null })).toEqual([]);
    expect(await build({ readBlob: async () => "[]" })).toEqual([]);
  });

  it("a code list that cannot be used gives only qual/unreadable.txt, naming it (no Markdown), and never throws or reaches the engine", async () => {
    const lostLines = ["These could not be opened, so they are not in this zip:", "", "Saved work: Coded passages", ""].join("\n");
    const cases: Array<[string, () => Promise<string | null>]> = [
      ["does not open", async () => { throw new VaultError("corrupt"); }],
      ["not json", async () => "not json {"],
      ["not a list", async () => JSON.stringify({ not: "a list" })],
      ["parents loop", async () => JSON.stringify([C("a", "A", "b"), C("b", "B", "a")])],
      ["self-parent", async () => JSON.stringify([C("a", "Self", "a")])]
    ];
    for (const [why, readBlob] of cases) {
      const files = await build({ readBlob });
      expect(files.map((f) => f.path), why).toEqual(["qual/unreadable.txt"]);
      expect(files[0]!.data, why).toBe(lostLines);
    }
  });

  it("skips a document that does not open, names it in qual/unreadable.txt, and builds from the others; an empty title reads as Untitled", async () => {
    const files = await build({ listDocuments: async () => [{ ...LIST[0]!, title: "" }, LIST[1]!, LIST[2]!] });
    expect(files.map((f) => f.path)).toEqual([`qual/${NAME}`, "qual/unreadable.txt"]);
    const md = files[0]!.data as string;
    expect(md).toContain('- **Untitled:** "anxious and tired"');
    expect(md).toContain('- **Interview two:** "walking"');
    expect(md).not.toContain("Locked");
    expect(files[1]!.data).toBe("These could not be opened, so they are not in this zip:\n\nDocument: Locked\n");
  });

  it("the clean case writes no unreadable file", async () => {
    const files = await build({ listDocuments: async () => [LIST[0]!, LIST[1]!] });
    expect(files.map((f) => f.path)).toEqual([`qual/${NAME}`]);
  });

  it("the day is the local one just after midnight (not the UTC day)", async () => {
    const early = new Date(2026, 0, 1, 0, 30);
    expect((await qualPart().build({ ...deps(GOOD), now: early })).map((f) => f.path)).toEqual(["qual/appuscholar-coded-passages-2026-01-01.md"]);
  });

  it("a failure other than 'does not open' still rejects (the export fails rather than writing a file with passages missing)", async () => {
    await expect(build({ getDocument: async () => { throw new Error("offline"); } })).rejects.toThrow("offline");
  });
});

describe("R4: no code colour in any export", () => {
  it("the project export with the part ticked: the md is under qual/, and neither it nor any document file has a style or the codes' colours", async () => {
    const blob = await exportProject(deps(), ["documents", qualPart()], { style: "apa", now: NOW, lastSearch: null });
    const z = await JSZip.loadAsync(await blobBuffer(blob));
    const names = Object.keys(z.files).filter((n) => !z.files[n]!.dir).sort();
    // unreadable.txt is the export's own list of the document that does not open ("bad"); the part names it again in qual/unreadable.txt.
    expect(names).toEqual([`qual/${NAME}`, "qual/unreadable.txt", "unreadable.txt", "documents/Interview one.doc", "documents/Interview one.html", "documents/Interview two.doc", "documents/Interview two.html"].sort());
    for (const n of names) {
      const s = await z.file(n)!.async("string");
      expect(s, n).not.toMatch(/style\s*=/i);
      for (const c of TREE) expect(s.toLowerCase(), n).not.toContain(c.color.toLowerCase());
    }
    // The tags themselves are in the documents (class, data-qcode, title only).
    expect(await z.file("documents/Interview one.html")!.async("string")).toContain('class="qual-tag" data-qcode="qa"');
    expect(await z.file(`qual/${NAME}`)!.async("string")).toBe(EXPECTED);
  });

  it("the part left unticked adds nothing", async () => {
    const z = await JSZip.loadAsync(await blobBuffer(await exportProject(deps(), ["documents"], { style: "apa", now: NOW, lastSearch: null })));
    expect(Object.keys(z.files).some((n) => n.startsWith("qual/"))).toBe(false);
  });
});
