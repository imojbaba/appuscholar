// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureConfirmText, captureRecord, captureRecordV2, decodeCapture, type CitationEntry } from "@appuscholar/core";

/*
 * The one-click capture's page side (v1 citCheckCaptureHash 13637-13655, called at boot 13676-13677): the address, the confirm, the save and the toasts. The bookmarklet's
 * source, the decode, the question and the entry are core's (packages/core/test/golden/citcapture.test.ts). Every expected value is v1's own, from
 * test/golden/citshare/cases.json: the bookmarklet's href at http://localhost/, the hash it opened the app with on each article page (run in jsdom), and for each hash what v1's
 * citCheckCaptureHash asked, toasted, saved and left in the address bar.
 */
type Run = { confirms: string[]; toasts: string[]; libAfter: CitationEntry[]; href: string };
type Fx = {
  bookmarklet: { href: string; source: string };
  pages: Array<{ id: string; opened: Array<{ url: string; target: string }>; alerts: string[] }>;
  libBefore: CitationEntry[];
  captures: Array<{ id: string; hash: string; accepted: Run; again: Run; declined: Run }>;
  bad: Array<{ id: string; hash: string } & Run>;
};
const FX = JSON.parse(readFileSync(join(__dirname, "../../../packages/core/test/golden/citshare/cases.json"), "utf8")) as Fx;

const h = vi.hoisted(() => ({
  library: null as unknown as { lib: CitationEntry[]; ready: boolean; loading: boolean; locked: boolean; update: ReturnType<typeof vi.fn>; fillEmpty: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> },
  toast: vi.fn(),
  /** How many mounted components ask for the library (the provider's `demands`). */
  demands: 0
}));
vi.mock("@/lib/cite/useLibrary", async () => {
  const { useEffect } = await import("react");
  return { useLibrary: () => { useEffect(() => { h.demands++; return () => { h.demands--; }; }, []); return h.library; } };
});
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { CaptureHash, fileCapture, resetCaptureHash, takeCaptureHash } from "../lib/cite/capture";
import { fillEmptyIn } from "../lib/cite/fillEmpty";
import en from "../messages/en.json";

const ALREADY_IN_LIBRARY = en.rs2_already_in_your_library;
const t = (k: string, vars?: Record<string, string | number>) => ((en as Record<string, string>)[k] ?? k).replace(/\{(\w+)\}/g, (m, x: string) => (vars && x in vars ? String(vars[x]) : m));
/** The bookmarklet's hash for a payload, encoded as the bookmarklet encodes it (btoa of the UTF-8 JSON). */
const hashOf = (d: Record<string, string>) => "#capture=" + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(d)))));
/** What bookmarkletSourceV2 sends from a PubMed page (citation_authors, volume, issue, first page). */
const PM = { title: "Sleep timing and exam anxiety in first-year students", author: "Schaefer EM; Gonzalez CB; Lee K; Park J; Wu T", year: "2024", source: "Scientific reports", doi: "", url: "https://pubmed.ncbi.nlm.nih.gov/41234567/", volume: "9", issue: "1", pages: "13317" };
/** The entry v1's bookmarklet left for the same PubMed page: no author, no volume, issue or pages. */
const PM_V1_ENTRY = captureRecord({ ...PM, author: "", volume: undefined, issue: undefined, pages: undefined } as never);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const raw = (hash: string) => hash.slice("#capture=".length);
/** The address without its origin: v1 ran at http://localhost/, these tests at jsdom's own origin. */
const path = (href: string) => { const u = new URL(href); return u.pathname + u.search + u.hash; };

describe("takeCaptureHash strips the hash as v1 does (13642)", () => {
  it("a capture hash is taken and the address left without it; any other hash is left alone", () => {
    const replace = vi.fn();
    expect(takeCaptureHash({ hash: FX.captures[0]!.hash, pathname: "/", search: "?x=1" }, replace)).toBe(raw(FX.captures[0]!.hash));
    expect(replace).toHaveBeenCalledWith("/?x=1");
    replace.mockClear();
    expect(takeCaptureHash({ hash: "#section-2", pathname: "/", search: "" }, replace)).toBeNull();
    expect(takeCaptureHash({ hash: "", pathname: "/", search: "" }, replace)).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("fileCapture: the duplicate rule and the toasts (13650-13653)", () => {
  for (const c of FX.captures) {
    it(`${c.id}: saved once, then "Already in your library"`, () => {
      const rec = captureRecord(decodeCapture(raw(c.hash))!);
      const toast = vi.fn();
      let stored: CitationEntry[] = FX.libBefore.slice();
      const update = vi.fn((fn: (p: CitationEntry[]) => CitationEntry[]) => { stored = fn(stored); return true; });
      const fillEmpty = vi.fn(() => true);
      fileCapture(rec, { lib: stored, update, fillEmpty, toast, t });
      expect(stored).toEqual(c.accepted.libAfter);
      expect(toast.mock.calls.map((x) => x[0])).toEqual(c.accepted.toasts);
      toast.mockClear();
      fileCapture(rec, { lib: stored, update, fillEmpty, toast, t });
      expect(stored).toEqual(c.again.libAfter);
      expect(fillEmpty).not.toHaveBeenCalled();
      expect(toast.mock.calls.map((x) => x[0])).toEqual(c.again.toasts);
      expect(c.again.toasts).toEqual([ALREADY_IN_LIBRARY]);
    });
  }
  it("a broken library the student keeps is left alone, with no toast", () => {
    const toast = vi.fn();
    fileCapture(captureRecord(decodeCapture(raw(FX.captures[0]!.hash))!), { lib: [], update: () => false, fillEmpty: () => false, toast, t });
    expect(toast).not.toHaveBeenCalled();
  });
});

describe("fileCapture fills an authorless entry the same title recaptures (W1)", () => {
  const deps = (start: CitationEntry[]) => {
    const box = { stored: start.slice() };
    const update = vi.fn((fn: (p: CitationEntry[]) => CitationEntry[]) => { box.stored = fn(box.stored); return true; });
    const fillEmpty = vi.fn((match: (e: CitationEntry) => boolean, fill: Partial<CitationEntry>) => update((p) => fillEmptyIn(p, match, fill)));
    const toast = vi.fn();
    return { box, update, fillEmpty, toast };
  };
  it("a recapture of an authorless source fills it instead of adding a second one", () => {
    // The entry v1's bookmarklet left on a PubMed page, with a year the student corrected by hand.
    const start = [...FX.libBefore, { ...PM_V1_ENTRY, year: "2023" }];
    const d = deps(start);
    const rec = captureRecordV2(decodeCapture(raw(hashOf(PM)))!);
    fileCapture(rec, { lib: d.box.stored, update: d.update, fillEmpty: d.fillEmpty, toast: d.toast, t });
    expect(d.box.stored).toHaveLength(start.length);
    expect(d.box.stored.at(-1)).toEqual({ ...PM_V1_ENTRY, year: "2023", author: "Schaefer, EM; Gonzalez, CB; Lee, K; Park, J; Wu, T", volume: "9", issue: "1", pages: "13317" });
    expect(d.box.stored.slice(0, -1)).toEqual(FX.libBefore);
    expect(d.toast.mock.calls.map((x) => x[0])).toEqual([`Updated "${PM.title}" in your citation library with what this page lists.`]);
    // Capturing it again is v1's duplicate.
    d.toast.mockClear();
    fileCapture(rec, { lib: d.box.stored, update: d.update, fillEmpty: d.fillEmpty, toast: d.toast, t });
    expect(d.box.stored).toHaveLength(start.length);
    expect(d.toast.mock.calls.map((x) => x[0])).toEqual([ALREADY_IN_LIBRARY]);
  });
  it("a fill the library refuses (a broken library kept) says nothing", () => {
    const toast = vi.fn();
    fileCapture(captureRecordV2(decodeCapture(raw(hashOf(PM)))!), { lib: [PM_V1_ENTRY], update: () => false, fillEmpty: () => false, toast, t });
    expect(toast).not.toHaveBeenCalled();
  });
  it("fillEmptyIn writes only the fields that are empty in the first match, and leaves the list as it is when nothing changes", () => {
    const lib: CitationEntry[] = [{ title: "A", author: "" }, { title: "T", author: "", year: "2020", volume: "" }, { title: "T", author: "" }];
    const out = fillEmptyIn(lib, (e) => e.title === "T", { author: "Lee, K", year: "2024", volume: "9", pages: "" });
    expect(out).toEqual([{ title: "A", author: "" }, { title: "T", author: "Lee, K", year: "2020", volume: "9" }, { title: "T", author: "" }]);
    expect(lib[1]).toEqual({ title: "T", author: "", year: "2020", volume: "" });
    expect(fillEmptyIn(out, (e) => e.title === "T", { author: "Other", year: "1999" })).toBe(out);
    expect(fillEmptyIn(out, (e) => e.title === "nope", { author: "X" })).toBe(out);
  });
});

describe("<CaptureHash/>: the load-time check", () => {
  const roots: Root[] = [];
  let stored: CitationEntry[] = [];
  /** The library as the last flush sent it (null: no flush). */
  let sent: CitationEntry[] | null = null;
  const mount = () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    roots.push(root);
    act(() => { root.render(createElement(CaptureHash)); });
    return root;
  };
  const rerender = () => { act(() => { for (const r of roots) r.render(createElement(CaptureHash)); }); };
  beforeEach(() => {
    stored = FX.libBefore.slice();
    const update = vi.fn((fn: (p: CitationEntry[]) => CitationEntry[]) => { stored = fn(stored); h.library = { ...h.library, lib: stored }; return true; });
    h.library = {
      lib: stored, ready: true, loading: false, locked: false, update,
      // useLibrary's fillEmpty: fillEmptyIn as an update.
      fillEmpty: vi.fn((match: (e: CitationEntry) => boolean, fill: Partial<CitationEntry>) => update((p) => fillEmptyIn(p, match, fill))),
      // The library's save sent now (useProjectBlob's flush): what reaches the server is the library as it stands.
      flush: vi.fn(async () => { sent = stored.slice(); return true; })
    };
    sent = null;
    h.toast.mockReset();
    h.demands = 0;
    resetCaptureHash();
  });
  afterEach(() => {
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    window.history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });
  const toasts = () => h.toast.mock.calls.map((c) => c[0] as string);

  for (const c of FX.captures) {
    it(`${c.id}: strips the hash, asks v1's question, saves and toasts`, () => {
      window.history.replaceState(null, "", "/" + c.hash);
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      mount();
      expect(path(window.location.href)).toBe(path(c.accepted.href));
      expect(confirm.mock.calls.map((x) => x[0])).toEqual(c.accepted.confirms);
      expect(stored).toEqual(c.accepted.libAfter);
      expect(toasts()).toEqual(c.accepted.toasts);
    });
  }
  it("the filed entry is sent at once, not after the save delay: a tab closed right after the toast keeps it", () => {
    const c = FX.captures[0]!;
    window.history.replaceState(null, "", "/" + c.hash);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const root = mount();
    act(() => { root.unmount(); });
    roots.splice(0);
    expect(h.library.flush).toHaveBeenCalledTimes(1);
    expect(h.library.update.mock.invocationCallOrder[0]!).toBeLessThan(h.library.flush.mock.invocationCallOrder[0]!);
    expect(sent).toEqual(c.accepted.libAfter);
    expect(toasts()).toEqual(c.accepted.toasts);
  });
  it("a declined question saves nothing and says nothing", () => {
    const c = FX.captures[0]!;
    window.history.replaceState(null, "", "/" + c.hash);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mount();
    expect(stored).toEqual(c.declined.libAfter);
    expect(toasts()).toEqual(c.declined.toasts);
    expect(h.library.update).not.toHaveBeenCalled();
    expect(path(window.location.href)).toBe(path(c.declined.href));
  });
  it("a duplicate is refused with v1's toast", () => {
    const c = FX.captures[1]!;
    stored = c.accepted.libAfter.slice();
    h.library = { ...h.library, lib: stored };
    window.history.replaceState(null, "", "/" + c.hash);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mount();
    expect(toasts()).toEqual([ALREADY_IN_LIBRARY]);
    expect(h.library.update).not.toHaveBeenCalled();
  });
  it("W30: a bookmark dragged before the fix sends year \"09/1\"; the question shows no year and the entry stores none", () => {
    window.history.replaceState(null, "", "/" + hashOf({ ...PM, year: "09/1" }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    mount();
    expect(confirm.mock.calls.map((x) => x[0])).toEqual([captureConfirmText({ ...PM, year: "" })]);
    expect(String(confirm.mock.calls[0]![0])).not.toContain("09/1");
    expect(stored.at(-1)).toMatchObject({ title: PM.title, year: "" });
  });
  for (const b of FX.bad) {
    it(`a bad hash (${b.id}) does what v1 did`, () => {
      window.history.replaceState(null, "", "/" + b.hash);
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      mount();
      expect(confirm.mock.calls.map((x) => x[0])).toEqual(b.confirms);
      expect(toasts()).toEqual(b.toasts);
      expect(stored).toEqual(b.libAfter);
      expect(path(window.location.href)).toBe(path(b.href));
    });
  }
  it("waits for the library (project resolved, vault open) before it saves, and saves once", () => {
    const c = FX.captures[0]!;
    h.library = { ...h.library, ready: false, loading: true };
    window.history.replaceState(null, "", "/" + c.hash);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mount();
    expect(path(window.location.href)).toBe("/");
    expect(h.library.update).not.toHaveBeenCalled();
    h.library = { ...h.library, ready: true, loading: false, locked: true };
    rerender();
    expect(h.library.update).not.toHaveBeenCalled();
    h.library = { ...h.library, locked: false };
    rerender();
    rerender();
    expect(h.library.update).toHaveBeenCalledTimes(1);
    expect(stored).toEqual(c.accepted.libAfter);
    expect(toasts()).toEqual(c.accepted.toasts);
  });
  it("asks for the library only while an entry waits: released once it is filed, or when there is nothing to file", () => {
    const c = FX.captures[0]!;
    h.library = { ...h.library, ready: false, loading: true };
    window.history.replaceState(null, "", "/" + c.hash);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mount();
    expect(h.demands).toBe(1);
    h.library = { ...h.library, ready: true, loading: false };
    rerender();
    expect(h.library.update).toHaveBeenCalledTimes(1);
    expect(h.demands).toBe(0);
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    resetCaptureHash();
    window.history.replaceState(null, "", "/" + c.hash);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mount();
    expect(h.demands).toBe(0);
  });
  it("a PubMed capture (bookmarkletSourceV2's payload) is saved with every author as Surname, Initials and its volume, issue and pages (W1)", () => {
    window.history.replaceState(null, "", "/" + hashOf(PM));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mount();
    expect(stored).toEqual([...FX.libBefore, captureRecordV2(PM)]);
    expect(stored.at(-1)).toMatchObject({ author: "Schaefer, EM; Gonzalez, CB; Lee, K; Park, J; Wu, T", volume: "9", issue: "1", pages: "13317" });
    expect(toasts()).toEqual(['Captured "' + PM.title + '" into your citation library ✓']);
  });
  it("a recapture of an authorless source fills it in the library and is sent at once", () => {
    stored = [...FX.libBefore, PM_V1_ENTRY];
    h.library = { ...h.library, lib: stored };
    window.history.replaceState(null, "", "/" + hashOf(PM));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mount();
    expect(stored).toHaveLength(FX.libBefore.length + 1);
    expect(stored.at(-1)).toMatchObject({ title: PM.title, author: "Schaefer, EM; Gonzalez, CB; Lee, K; Park, J; Wu, T", volume: "9", issue: "1", pages: "13317" });
    expect(toasts()).toEqual([`Updated "${PM.title}" in your citation library with what this page lists.`]);
    expect(h.library.flush).toHaveBeenCalledTimes(1);
    expect(sent).toEqual(stored);
  });
  it("the hash is read once per page load: a second mount finds nothing to do", () => {
    const c = FX.captures[0]!;
    window.history.replaceState(null, "", "/" + c.hash);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    mount();
    mount();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(h.library.update).toHaveBeenCalledTimes(1);
  });
});
