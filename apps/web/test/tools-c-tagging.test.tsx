// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QualCode } from "@appuscholar/core";
import en from "../messages/en.json";
import qualEn from "../messages/tools/qual.en.json";

/*
 * Task C2: tagging a passage (v1 qualTagSelection 6245-6263), the colours drawn in the document by the module's DocumentLayer (v1 painted them inline at 6255 and
 * hid them with `qual-hide`, 13674), the passages view (qualOpenPassages 6298-6309) and the delete that takes the tag off every document (qualDeleteCode 6235-6244).
 * useProjectBlob is replaced by a store in which EACH hook instance keeps its own copy, as the real one does: only the in-window store of the module, or a
 * pop-out's announce (remote()), can bring a change from one instance to another. docAccess is a fake.
 */

type Snap = { value: unknown; loading: boolean; locked: boolean; broken?: boolean };
const h = vi.hoisted(() => ({
  blobs: {} as Record<string, Snap>,
  instances: new Set<{ kind: string; apply: (v: unknown) => void }>(),
  sets: [] as Array<{ kind: string; value: unknown }>,
  access: {} as Record<string, unknown>,
  documents: [] as Array<{ id: string }>,
  vault: "unlocked" as string
}));
vi.mock("@/lib/blobs/useProjectBlob", async () => {
  const { useEffect, useState } = await import("react");
  return {
    useProjectBlob: (kind: string) => {
      const [snap, setSnap] = useState<Snap>(() => h.blobs[kind]!);
      useEffect(() => {
        const inst = { kind, apply: (value: unknown) => setSnap((s) => ({ ...s, value })) };
        h.instances.add(inst);
        return () => { h.instances.delete(inst); };
      }, [kind]);
      return {
        ...snap,
        set: (next: unknown) => {
          const value = typeof next === "function" ? (next as (p: unknown) => unknown)(snap.value) : next;
          h.sets.push({ kind, value });
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
// The project's live documents as the shell lists them, and the vault's state (the layer reads only once it is open).
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ documents: h.documents }) }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: h.vault }) }));

import { Panel } from "../components/tools/qual/Panel";
import { DocumentLayer } from "../components/tools/qual/DocumentLayer";
import { codeColourCss } from "../lib/tools/qual/colours";
import { resetLive } from "../lib/tools/qual/liveStore";

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
  return root;
}
async function click(id: string) {
  const el = tid(id);
  if (!el) throw new Error("no element " + id);
  await act(async () => { el.click(); });
}
async function type(id: string, value: string) {
  const el = tid(id) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
/** A change another window saved: every instance of the blob reads it again. */
async function remote(kind: string, value: unknown) {
  h.blobs[kind] = { ...h.blobs[kind]!, value };
  await act(async () => { for (const i of h.instances) if (i.kind === kind) i.apply(value); });
}
const C = (id: string, name: string, parentId: string | null, color = "#f59e0b"): QualCode => ({ id, name, parentId, color });
const TREE: QualCode[] = [C("qa", "Coping", null), C("qb", "Barriers", null, "#10b981"), C("qc", "Social support", "qa", "#3b82f6")];
const css = () => document.body.querySelector("style[data-testid='qual-colours']")?.textContent ?? null;
const status = () => tid("qual-status")!.textContent;
const wrap = () => h.access.wrapSelection as ReturnType<typeof vi.fn>;

beforeEach(() => {
  h.blobs = { qual_codes: { value: TREE, loading: false, locked: false }, qual_prefs: { value: null, loading: false, locked: false } };
  h.sets = [];
  h.documents = [];
  h.vault = "unlocked";
  h.instances.clear();
  resetLive();
  h.access = {
    wrapSelection: vi.fn(async () => "done"),
    allDocuments: vi.fn(async () => []),
    rewriteDocument: vi.fn(async () => true)
  };
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("tagging", () => {
  it("tapping a code's name tags the selection: tag qual-tag, attrs data-qcode and title = the name, nothing else", async () => {
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-name-qc");
    expect(wrap()).toHaveBeenCalledTimes(1);
    expect(wrap()).toHaveBeenCalledWith("qual-tag", { "data-qcode": "qc", title: "Social support" });
    expect(status()).toBe('Tagged as "Social support"');
  });

  it("the swatch does the same, as a button of its own", async () => {
    await render(<Panel tab="coding" projectId="p1" />);
    const sw = tid("qual-swatch-qb")!;
    expect(sw.tagName).toBe("BUTTON");
    expect(sw.getAttribute("type")).toBe("button");
    expect(sw.getAttribute("title")).toBe(E.qual_tip_tag);
    await click("qual-swatch-qb");
    expect(wrap()).toHaveBeenCalledWith("qual-tag", { "data-qcode": "qb", title: "Barriers" });
    expect(status()).toBe('Tagged as "Barriers"');
  });

  it("name and swatch are keyboard buttons with v1's tooltip and a name that says what they do", async () => {
    await render(<Panel tab="coding" projectId="p1" />);
    for (const id of ["qual-name-qa", "qual-swatch-qa"]) {
      const el = tid(id)!;
      expect(el.tagName).toBe("BUTTON");
      expect(el.getAttribute("title")).toBe("Tap to tag the selected passage");
    }
    expect(tid("qual-name-qa")!.textContent).toBe("Coping");
    expect(tid("qual-swatch-qa")!.getAttribute("aria-label")).toBe("Tag the selected passage as Coping");
  });

  it("a press does not take the editor's selection: mousedown is cancelled on the name and the swatch", async () => {
    await render(<Panel tab="coding" projectId="p1" />);
    for (const id of ["qual-name-qa", "qual-swatch-qa"]) {
      const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      await act(async () => { tid(id)!.dispatchEvent(ev); });
      expect(ev.defaultPrevented, id).toBe(true);
    }
  });

  it("says v1's two refusals on the status line (role status, polite)", async () => {
    await render(<Panel tab="coding" projectId="p1" />);
    const line = tid("qual-status")!;
    expect(line.getAttribute("role")).toBe("status");
    expect(line.getAttribute("aria-live")).toBe("polite");
    wrap().mockResolvedValueOnce("no-selection");
    await click("qual-name-qa");
    expect(status()).toBe("Select some text in your document first, then tap a code to tag it");
    wrap().mockResolvedValueOnce("crosses-paragraph");
    await click("qual-name-qa");
    expect(status()).toBe("Select a passage within a single paragraph (not across headings or list items)");
  });

  it("tagging does not touch the code list or the preferences", async () => {
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-name-qa");
    expect(h.sets).toEqual([]);
  });

  it("while the codes are locked nothing is tagged", async () => {
    h.blobs.qual_codes = { value: TREE, loading: false, locked: true };
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-name-qa");
    expect(wrap()).not.toHaveBeenCalled();
  });
});

describe("codeColourCss", () => {
  it("one rule for each code, colour + 55 for the background and + 88 for the ring (v1 6255), scoped to the editor", () => {
    expect(codeColourCss([C("qa", "A", null, "#f59e0b"), C("q_b-2", "B", null, "#10B981")]).split("\n")).toEqual([
      '.editor .ProseMirror span.qual-tag[data-qcode="qa"]{background:#f59e0b55;box-shadow:0 0 0 1px #f59e0b88}',
      '.editor .ProseMirror span.qual-tag[data-qcode="q_b-2"]{background:#10B98155;box-shadow:0 0 0 1px #10B98188}'
    ]);
  });

  it("skips a hostile colour or id, and anything that is not a list of codes", () => {
    const hostile = codeColourCss([
      C("qa", "A", null, "red;}body{display:none"),
      C('q"]{}body{display:none}[x="', "B", null, "#10b981"),
      C("qc", "C", null, "#fff"),
      C("qd", "D", null, "#12345g"),
      C("qe", "E", null, "#3b82f6")
    ]);
    expect(hostile.split("\n")).toEqual(['.editor .ProseMirror span.qual-tag[data-qcode="qe"]{background:#3b82f655;box-shadow:0 0 0 1px #3b82f688}']);
    expect(codeColourCss(null)).toBe("");
    expect(codeColourCss("nope" as unknown as QualCode[])).toBe("");
    expect(codeColourCss([null, 3, { id: 1 }] as unknown as QualCode[])).toBe("");
  });
});

describe("DocumentLayer", () => {
  it("draws one style with each code's colours and no names", async () => {
    await render(<DocumentLayer projectId="p1" />);
    const s = css()!;
    expect(s).toContain('[data-qcode="qa"]{background:#f59e0b55;box-shadow:0 0 0 1px #f59e0b88}');
    expect(s).toContain('[data-qcode="qb"]{background:#10b98155;box-shadow:0 0 0 1px #10b98188}');
    expect(s).toContain('[data-qcode="qc"]{background:#3b82f655;box-shadow:0 0 0 1px #3b82f688}');
    expect(s).not.toContain("Coping");
    expect(document.body.querySelectorAll("style[data-testid='qual-colours']")).toHaveLength(1);
  });

  it("draws nothing when the preference is off", async () => {
    h.blobs.qual_prefs = { value: { showcolors: false }, loading: false, locked: false };
    await render(<DocumentLayer projectId="p1" />);
    expect(css()).toBeNull();
    expect(document.body.querySelector("style")).toBeNull();
  });

  it("draws nothing while the codes are read, when there are none, or when the stored value is not a list", async () => {
    h.blobs.qual_codes = { value: null, loading: true, locked: false };
    await render(<DocumentLayer projectId="p1" />);
    expect(css()).toBeNull();
    await remote("qual_codes", []);
    expect(css()).toBeNull();
    await remote("qual_codes", { not: "a list" });
    expect(css()).toBeNull();
  });

  it("a hostile colour or id from the stored list never reaches the style", async () => {
    h.blobs.qual_codes = { value: [C("qa", "A", null, "red;}body{display:none"), C('x"]{}', "B", null, "#10b981"), C("qz", "Z", null, "#3b82f6")], loading: false, locked: false };
    await render(<DocumentLayer projectId="p1" />);
    const s = css()!;
    expect(s.split("\n")).toHaveLength(1);
    expect(s).toContain('[data-qcode="qz"]');
    expect(s).not.toContain("display:none");
  });

  it("the panel's toggle reaches the layer in the same window at once, off and on (two hook instances share nothing else)", async () => {
    await render(<><Panel tab="coding" projectId="p1" /><DocumentLayer projectId="p1" /></>);
    expect(css()).not.toBeNull();
    await click("qual-show-colors");
    expect(h.sets.at(-1)).toEqual({ kind: "qual_prefs", value: { showcolors: false } });
    expect(css()).toBeNull();
    await click("qual-show-colors");
    expect(css()).toContain('[data-qcode="qa"]');
  });

  it("adding and deleting a code reach the layer at once", async () => {
    await render(<><Panel tab="coding" projectId="p1" /><DocumentLayer projectId="p1" /></>);
    await click("qual-add-top");
    await type("qual-name-input", "Hope");
    await click("qual-name-submit");
    const added = (h.blobs.qual_codes!.value as QualCode[]).at(-1)!;
    expect(added.name).toBe("Hope");
    expect(css()).toContain(`[data-qcode="${added.id}"]`);
    await click("qual-delete-qb");
    await click("qual-delete-confirm-yes");
    expect(css()).not.toContain('[data-qcode="qb"]');
    expect(css()).toContain('[data-qcode="qa"]');
  });

  it("a rename or a recolour changes the style only; it never reads or writes a document", async () => {
    await render(<><Panel tab="coding" projectId="p1" /><DocumentLayer projectId="p1" /></>);
    await click("qual-rename-qa");
    await type("qual-name-input", "Coping well");
    await click("qual-name-submit");
    expect((h.blobs.qual_codes!.value as QualCode[])[0]!.name).toBe("Coping well");
    await remote("qual_codes", TREE.map((c) => (c.id === "qa" ? { ...c, color: "#ef4444" } : c)));
    expect(css()).toContain('[data-qcode="qa"]{background:#ef444455');
    for (const fn of ["wrapSelection", "allDocuments", "rewriteDocument"]) expect(h.access[fn], fn).not.toHaveBeenCalled();
  });

  it("follows a change another window announced (a pop-out), with no panel in this window", async () => {
    await render(<DocumentLayer projectId="p1" />);
    await remote("qual_codes", [C("qn", "New", null, "#8b5cf6")]);
    expect(css()).toContain('[data-qcode="qn"]');
    expect(css()).not.toContain('[data-qcode="qa"]');
    await remote("qual_prefs", { showcolors: false });
    expect(css()).toBeNull();
  });

  it("after the panel has gone, a newer change from another window wins over what the panel last said", async () => {
    const root = await render(<><Panel key="panel" tab="coding" projectId="p1" /><DocumentLayer key="layer" projectId="p1" /></>);
    await click("qual-show-colors");
    expect(css()).toBeNull();
    // The panel goes (another place opens); the layer stays mounted, as the shell's does.
    await act(async () => { root.render(<DocumentLayer key="layer" projectId="p1" />); });
    expect(css()).toBeNull();
    await remote("qual_prefs", { showcolors: true });
    expect(css()).not.toBeNull();
  });
});

const tag = (id: string, text: string) => `<span class="qual-tag" data-qcode="${id}" title="x">${text}</span>`;
const docs = (...ds: Array<[string, string, string]>) => ds.map(([id, title, html]) => ({ id, title, html, text: "" }));
/** What allDocuments() reads; the shell lists the same documents as the project's. */
const setDocs = (d: ReturnType<typeof docs>) => { h.documents = d.map((x) => ({ id: x.id })); (h.access.allDocuments as ReturnType<typeof vi.fn>).mockResolvedValue(d); };
const rewrite = () => h.access.rewriteDocument as ReturnType<typeof vi.fn>;

describe("the passages view", () => {
  it("the eye button replaces the tree with the code's passages: document title, then the words in curly quotes, in order", async () => {
    setDocs(docs(["a", "Interview 1", `<p>${tag("qc", "friends listen")}</p><p>${tag("qa", "other")}</p>`], ["b", "", `<p>${tag("qc", "  a second  ")}</p>`]));
    await render(<Panel tab="coding" projectId="p1" />);
    const eye = tid("qual-passages-qc")!;
    expect(eye.getAttribute("title")).toBe("View tagged passages");
    expect(eye.getAttribute("aria-label")).toBe("View the passages tagged Social support");
    await click("qual-passages-qc");
    expect(tid("qual-tree")).toBeNull();
    expect(tid("qual-add-top")).toBeNull();
    expect(tid("qual-passages-h")!.textContent).toBe("Coded passages Social support");
    expect(tid("qual-passages")!.textContent).toContain(E.qual_passages_desc);
    const rows = Array.from(document.body.querySelectorAll("[data-testid='qual-passage']"));
    expect(rows.map((r) => r.querySelector("[data-testid='qual-passage-doc']")!.textContent)).toEqual(["Interview 1", "Untitled"]);
    expect(rows.map((r) => r.textContent!.replace(r.querySelector("[data-testid='qual-passage-doc']")!.textContent!, ""))).toEqual(["“friends listen”", "“a second”"]);
    expect(h.access.allDocuments).toHaveBeenCalledTimes(1);
  });

  it("shows a loading state until the documents are read, then v1's line when there are none", async () => {
    let done!: (d: unknown[]) => void;
    (h.access.allDocuments as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((r) => { done = r; }));
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-passages-qb");
    expect(tid("qual-passages-loading")).not.toBeNull();
    expect(tid("qual-passages-empty")).toBeNull();
    await act(async () => { done([]); });
    expect(tid("qual-passages-loading")).toBeNull();
    expect(tid("qual-passages-empty")!.textContent).toBe("No passages tagged with this code yet.");
  });

  it("a passage that looks like markup is shown as text, never as markup", async () => {
    setDocs(docs(["a", "<b>Title</b>", `<p>${tag("qa", "&lt;img src=x onerror=alert(1)&gt;")}</p>`]));
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-passages-qa");
    const view = tid("qual-passages")!;
    expect(view.querySelector("img")).toBeNull();
    expect(view.querySelector("b")).toBeNull();
    expect(tid("qual-passage-doc")!.textContent).toBe("<b>Title</b>");
    expect(view.textContent).toContain("“<img src=x onerror=alert(1)>”");
  });

  it("Back to codes returns to the tree and focus goes back to the eye button; Back takes focus when the view opens", async () => {
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-passages-qb");
    expect(document.activeElement).toBe(tid("qual-passages-back"));
    expect(tid("qual-passages-back")!.textContent).toBe("Back to codes");
    await click("qual-passages-back");
    expect(tid("qual-tree")).not.toBeNull();
    expect(tid("qual-passages")).toBeNull();
    expect(document.activeElement).toBe(tid("qual-passages-qb"));
  });

  it("a documents read that fails shows the empty line", async () => {
    (h.access.allDocuments as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("x"));
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-passages-qa");
    expect(tid("qual-passages-empty")).not.toBeNull();
  });
});

describe("deleting a code takes its tags out of the documents first", () => {
  it("strips the code and its sub-code from every document that has them, rewrites only those, then removes the codes", async () => {
    setDocs(docs(
      ["a", "One", `<p>x ${tag("qa", "coping")} y ${tag("qc", "support")}</p>`],
      ["b", "Two", `<p>${tag("qb", "barrier")}</p>`],
      ["c", "Three", `<p>${tag("qc", "more")}</p>`]
    ));
    await render(<><Panel tab="coding" projectId="p1" /><DocumentLayer projectId="p1" /></>);
    await click("qual-delete-qa");
    await click("qual-delete-confirm-yes");
    expect(rewrite().mock.calls).toEqual([["a", "<p>x coping y support</p>"], ["c", "<p>more</p>"]]);
    expect((h.blobs.qual_codes!.value as QualCode[]).map((c) => c.id)).toEqual(["qb"]);
    expect(status()).toBe("Deleted");
    expect(css()).not.toContain('[data-qcode="qa"]');
  });

  it("a document that cannot be rewritten keeps every code, names the document, and a retry is safe", async () => {
    setDocs(docs(["a", "One", `<p>${tag("qa", "coping")}</p>`], ["b", "Held draft", `<p>${tag("qc", "support")}</p>`]));
    rewrite().mockImplementation(async (id: string) => id !== "b");
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-delete-qa");
    await click("qual-delete-confirm-yes");
    expect((h.blobs.qual_codes!.value as QualCode[]).map((c) => c.id)).toEqual(["qa", "qb", "qc"]);
    expect(h.sets.filter((s) => s.kind === "qual_codes")).toEqual([]);
    expect(status()).toContain("Held draft");
    expect(status()).toContain("Not deleted: the code is kept.");
    expect(status()).not.toContain("Nothing was changed");
    expect(tid("qual-delete-qa")).not.toBeNull();
    // The held text is saved; stripping again finds nothing left in "a" (already rewritten) and rewrites "b".
    setDocs(docs(["a", "One", "<p>coping</p>"], ["b", "Held draft", `<p>${tag("qc", "support")}</p>`]));
    rewrite().mockReset().mockResolvedValue(true);
    await click("qual-delete-qa");
    await click("qual-delete-confirm-yes");
    expect(rewrite().mock.calls).toEqual([["b", "<p>support</p>"]]);
    expect((h.blobs.qual_codes!.value as QualCode[]).map((c) => c.id)).toEqual(["qb"]);
    expect(status()).toBe("Deleted");
  });

  it("while it works the status line says so and the tree is off; Keep removes nothing", async () => {
    let release!: () => void;
    // A project with no document at all: nothing to strip, so the delete goes ahead once the (empty) read is back.
    (h.access.allDocuments as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((r) => { release = () => r([]); }));
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-delete-qb");
    await click("qual-delete-confirm-yes");
    expect(status()).toBe("Removing the tags from your documents");
    expect((tid("qual-name-qa") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { release(); });
    expect(status()).toBe("Deleted");
    await click("qual-delete-qa");
    await click("qual-delete-keep");
    expect((h.blobs.qual_codes!.value as QualCode[]).map((c) => c.id)).toEqual(["qa", "qc"]);
  });

  it("while the tags are being taken out, the question's Delete and Keep are off and focus stays in the question; the delete still finishes", async () => {
    let release!: () => void;
    (h.access.allDocuments as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((r) => { release = () => r([]); }));
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-delete-qb");
    expect((tid("qual-delete-keep") as HTMLButtonElement).disabled).toBe(false);
    await click("qual-delete-confirm-yes");
    expect((tid("qual-delete-confirm-yes") as HTMLButtonElement).disabled).toBe(true);
    expect((tid("qual-delete-keep") as HTMLButtonElement).disabled).toBe(true);
    expect(tid("qual-delete-confirm")!.contains(document.activeElement)).toBe(true);
    // A press on Keep does nothing now: the question stays and the delete is not cut short.
    await click("qual-delete-keep");
    expect(tid("qual-delete-confirm")).not.toBeNull();
    await act(async () => { release(); });
    expect(status()).toBe("Deleted");
    expect((h.blobs.qual_codes!.value as QualCode[]).map((c) => c.id)).toEqual(["qa", "qc"]);
    expect(tid("qual-delete-confirm")).toBeNull();
  });

  it("an orphan tag (its code already gone) is left alone and crashes nothing", async () => {
    setDocs(docs(["a", "One", `<p>${tag("zz", "orphan")} ${tag("qb", "barrier")}</p>`]));
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-delete-qb");
    await click("qual-delete-confirm-yes");
    expect(rewrite().mock.calls).toEqual([["a", `<p>${tag("zz", "orphan")} barrier</p>`]]);
  });
});

describe("a delete is refused while a document of the project was not read", () => {
  const UNREAD = "Not deleted. Some documents of this project could not be read (the vault is locked, you are offline, or a document does not open). Try again.";
  const deleteQa = async () => { await click("qual-delete-qa"); await click("qual-delete-confirm-yes"); };

  it("allDocuments() answering [] for a project that has documents: refused, codes intact, nothing rewritten", async () => {
    setDocs(docs(["a", "One", `<p>${tag("qa", "x")}</p>`], ["b", "Two", `<p>${tag("qc", "y")}</p>`]));
    (h.access.allDocuments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await render(<Panel tab="coding" projectId="p1" />);
    await deleteQa();
    expect(status()).toBe(UNREAD);
    expect(rewrite()).not.toHaveBeenCalled();
    expect(h.sets.filter((s) => s.kind === "qual_codes")).toEqual([]);
    expect((h.blobs.qual_codes!.value as QualCode[]).map((c) => c.id)).toEqual(["qa", "qb", "qc"]);
    // Nothing offers to delete anyway: the codes are still there to try again.
    expect(tid("qual-delete-qa")).not.toBeNull();
    expect(tid("qual-delete-confirm-yes")).toBeNull();
  });

  it("a document skipped by the read (one id missing): refused before any rewrite, even of the documents that were read", async () => {
    const all = docs(["a", "One", `<p>${tag("qa", "x")}</p>`], ["b", "Two", `<p>${tag("qa", "y")}</p>`], ["c", "Three", "<p>none</p>"]);
    setDocs(all);
    (h.access.allDocuments as ReturnType<typeof vi.fn>).mockResolvedValue(all.filter((d) => d.id !== "c"));
    await render(<Panel tab="coding" projectId="p1" />);
    await deleteQa();
    expect(status()).toBe(UNREAD);
    expect(rewrite()).not.toHaveBeenCalled();
    expect((h.blobs.qual_codes!.value as QualCode[]).map((c) => c.id)).toEqual(["qa", "qb", "qc"]);
  });

  it("a project with no documents: the delete goes ahead", async () => {
    h.documents = [];
    await render(<Panel tab="coding" projectId="p1" />);
    await deleteQa();
    expect(status()).toBe("Deleted");
    expect((h.blobs.qual_codes!.value as QualCode[]).map((c) => c.id)).toEqual(["qb"]);
  });
});

describe("the DocumentLayer never raises a passphrase prompt", () => {
  it("on a locked or loading vault it reads no blob and draws nothing; once the vault is open it reads and colours", async () => {
    const root = await render(<DocumentLayer projectId="p1" />);
    for (const status of ["locked", "loading"]) {
      h.vault = status;
      await act(async () => { root.render(<DocumentLayer projectId="p1" />); });
      expect(h.instances.size, status).toBe(0);
      expect(css(), status).toBeNull();
    }
    h.vault = "unlocked";
    await act(async () => { root.render(<DocumentLayer projectId="p1" />); });
    expect(h.instances.size).toBe(2);
    expect(css()).toContain('[data-qcode="qa"]');
  });

  it("reads with the vault off and while it migrates; goes back to nothing, and drops its reads, when it locks again", async () => {
    const root = await render(<DocumentLayer projectId="p1" />);
    for (const status of ["off", "migrating"]) {
      h.vault = status;
      await act(async () => { root.render(<DocumentLayer projectId="p1" />); });
      expect(css(), status).not.toBeNull();
    }
    h.vault = "locked";
    await act(async () => { root.render(<DocumentLayer projectId="p1" />); });
    expect(css()).toBeNull();
    expect(h.instances.size).toBe(0);
  });
});
