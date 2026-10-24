// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApNote, ApNotes, StoredEntry } from "../lib/blobs/kinds";
import { acrossData } from "../lib/analyse/cards";
import { noteAt, notePut, useApNotes, type ApNotesStore } from "../lib/analyse/notes";
import { citeExport } from "../lib/cite/share";

/*
 * Everything that reads Analyse a paper's notes skips a note that has moved to p:<pid> (it would count twice), and, until B3, Analyse a paper itself follows
 * the move, so the note it reads and writes is the one Compare reads (wave B, Task 17, rulings B2-R9, R10, R13).
 */

type BlobStub<T> = { value: T | null; loading: boolean; locked: boolean; broken?: boolean; readOnly?: boolean; set: ReturnType<typeof vi.fn>; flush: () => Promise<boolean> };
const h = vi.hoisted(() => ({ notes: null as unknown, cols: null as unknown }));
vi.mock("@/lib/blobs/useProjectBlob", () => ({ useProjectBlob: (kind: string) => (kind === "ap_notes" ? h.notes : h.cols) }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const t = (k: string) => k;

const OLD: ApNote = { title: "Sleep and exam anxiety", stages: { design: { mine: "A survey of two classes." } }, card: { verdict: "Useful" }, chars: 5234 };
const MERGED: ApNote = { title: "Sleep and exam anxiety", pid: "kone", stages: { design: { mine: "A survey of two classes." } }, card: { verdict: "Useful" }, cells: { Sample: "120" } };
const MOVED: ApNotes = { asleepandexamanxiety5234: { ...OLD, movedTo: "p:kone" }, "p:kone": MERGED, aother99: { title: "Another paper", stages: {}, card: { strengths: "Clear" } } };

describe("the cards side by side", () => {
  it("lists a paper once: a note that moved is left out, the one it moved to is in", () => {
    const d = acrossData(t, MOVED, ["design", "verdict"], false);
    expect(d.ids).toEqual(["p:kone", "aother99"]);
    expect(d.body.map((r) => r[0])).toEqual(["Sleep and exam anxiety", "Another paper"]);
  });
  it("a note with no pid and no movedTo is listed as before", () => {
    const d = acrossData(t, { a1: OLD }, ["design"], false);
    expect(d.ids).toEqual(["a1"]);
  });
});

describe("Analyse a paper follows a note that moved (until B3)", () => {
  it("noteAt reads the note the old key moved to, and the old key's own note when it has not moved", () => {
    expect(noteAt(MOVED, "asleepandexamanxiety5234")).toBe(MERGED);
    expect(noteAt(MOVED, "p:kone")).toBe(MERGED);
    expect(noteAt(MOVED, "aother99")).toBe(MOVED.aother99);
    expect(noteAt(MOVED, "anothing")).toBeUndefined();
    // A move that points nowhere is a note that is not there yet, never the old copy brought back to life.
    expect(noteAt({ a1: { ...OLD, movedTo: "p:kgone" } }, "a1")).toBeUndefined();
  });

  it("a write for the old key lands on p:<pid>: the words of the stages already there stay, and the old note is not changed", () => {
    const out = notePut(MOVED, { id: "asleepandexamanxiety5234", title: "Sleep and exam anxiety" }, (n) => { n.card.weak = "Self-report only."; n.stages.gap = { mine: "A new gap." }; });
    expect(out["p:kone"]).toMatchObject({ pid: "kone", cells: { Sample: "120" }, stages: { design: { mine: "A survey of two classes." }, gap: { mine: "A new gap." } }, card: { verdict: "Useful", weak: "Self-report only." } });
    expect(out.asleepandexamanxiety5234).toBe(MOVED.asleepandexamanxiety5234);
    expect(Object.keys(out)).toEqual(Object.keys(MOVED));
    expect(MERGED.card.weak).toBeUndefined();
  });

  it("a write for a moved key whose target was removed makes the target again, with stages and card", () => {
    const out = notePut({ a1: { ...OLD, movedTo: "p:kgone" } }, { id: "a1", title: "Sleep and exam anxiety" }, (n) => { n.card.verdict = "Again"; });
    expect(out["p:kgone"]).toMatchObject({ title: "Sleep and exam anxiety", stages: {}, card: { verdict: "Again" } });
    expect(parseOk(out)).toBe(true);
  });

  it("a note that has not moved is written where it was (v1's apNotePut)", () => {
    const out = notePut({ a1: OLD }, { id: "a1", title: "T" }, (n) => { n.card.weak = "w"; });
    expect(out.a1).toMatchObject({ title: "T", card: { verdict: "Useful", weak: "w" } });
    expect(Object.keys(out)).toEqual(["a1"]);
  });
});

const roots: Root[] = [];
const box: { store: ApNotesStore | null } = { store: null };
function Probe() {
  const store = useApNotes("p1");
  useEffect(() => { box.store = store; });
  return null;
}
function blob<T>(value: T | null): BlobStub<T> { return { value, loading: false, locked: false, set: vi.fn(), flush: async () => true }; }
async function mountStore(notes: ApNotes) {
  h.notes = blob(notes);
  h.cols = blob<string[]>(null);
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  await act(async () => { root.render(<Probe />); });
  return h.notes as BlobStub<ApNotes>;
}
const parseOk = (notes: ApNotes) => Object.values(notes).every((n) => n.stages !== undefined && n.card !== undefined);
beforeEach(() => { box.store = null; });
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); });

describe("the notes store of Analyse a paper", () => {
  it("note() answers the moved-to note, and put() writes it as an update of the stored notes", async () => {
    const b = await mountStore(MOVED);
    expect(box.store!.note("asleepandexamanxiety5234")).toBe(MERGED);
    let ok = false;
    act(() => { ok = box.store!.put({ id: "asleepandexamanxiety5234", title: "Sleep and exam anxiety" }, (n) => { n.card.notes = "Check the sample."; }); });
    expect(ok).toBe(true);
    const update = b.set.mock.calls.at(-1)![0] as (p: ApNotes | null) => ApNotes;
    // Applied to whatever is stored when it is sent (here, a newer copy with one more note).
    const out = update({ ...MOVED, aanother1: { stages: {}, card: {} } });
    expect(out["p:kone"]!.card).toEqual({ verdict: "Useful", notes: "Check the sample." });
    expect(out.aanother1).toEqual({ stages: {}, card: {} });
  });
});

describe("the library file", () => {
  it("is written without pid, rl, abstract, oa or ack", async () => {
    const lib: StoredEntry[] = [{ author: "Lee, K.", title: "A paper", year: "2024", pid: "kone", rl: true, abstract: "Long", oa: "https://example.org/a.pdf", ack: ["numbers"], type: "Journal article", style: "apa" }];
    const download = vi.fn();
    citeExport({ lib, download, toast: () => {} });
    const blob = download.mock.calls[0]![1] as Blob;
    const text = await new Promise<string>((done) => { const r = new FileReader(); r.onload = () => done(String(r.result)); r.readAsText(blob); });
    expect(JSON.parse(text)).toEqual([{ author: "Lee, K.", title: "A paper", year: "2024", type: "Journal article", style: "apa" }]);
  });
});
