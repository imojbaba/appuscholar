// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CitationEntry } from "@appuscholar/core";

/*
 * The one-click capture (v1 citSetupBookmarklet 13622-13636, citCheckCaptureHash 13637-13655, called at boot 13676-13677). Every expected value is v1's own, from
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
  library: null as unknown as { lib: CitationEntry[]; ready: boolean; loading: boolean; locked: boolean; update: ReturnType<typeof vi.fn> },
  toast: vi.fn()
}));
vi.mock("@/lib/cite/useLibrary", () => ({ useLibrary: () => h.library }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import {
  bookmarkletHref, bookmarkletSource, CAPTURE_UNREADABLE, captureConfirmText, captureRecord, CaptureHash, decodeCapture, fileCapture, resetCaptureHash, takeCaptureHash
} from "../lib/cite/capture";
import { ALREADY_IN_LIBRARY } from "../lib/cite/actions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const raw = (hash: string) => hash.slice("#capture=".length);
/** The address without its origin: v1 ran at http://localhost/, these tests at jsdom's own origin. */
const path = (href: string) => { const u = new URL(href); return u.pathname + u.search + u.hash; };

describe("the bookmarklet (citSetupBookmarklet 13622-13636)", () => {
  it("its href equals v1's for http://localhost/", () => {
    expect(bookmarkletHref("http://localhost/")).toBe(FX.bookmarklet.href);
    expect(bookmarkletSource("http://localhost/")).toBe(FX.bookmarklet.source);
  });
  it("on every article page v1's bookmarklet opened the app with a hash, or alerted when the page has no title", () => {
    expect(FX.pages.filter((p) => p.opened.length === 1).map((p) => p.id)).toEqual(FX.captures.map((c) => c.id));
    expect(FX.pages.find((p) => p.id === "nothing")!.alerts).toEqual(["No citation info found on this page — this works best on a journal article, PubMed, or arXiv page."]);
    for (const p of FX.pages) for (const o of p.opened) { expect(o.url.startsWith("http://localhost/#capture=")).toBe(true); expect(o.target).toBe("_blank"); }
  });
});

describe("decodeCapture, captureRecord and the confirm (citCheckCaptureHash 13643-13651)", () => {
  for (const c of FX.captures) {
    it(`${c.id}: the record v1 saved and the question it asked`, () => {
      const d = decodeCapture(raw(c.hash));
      expect(d).not.toBeNull();
      expect(captureConfirmText(d!)).toBe(c.accepted.confirms[0]);
      expect(captureRecord(d!)).toEqual(c.accepted.libAfter[c.accepted.libAfter.length - 1]);
    });
  }
  it("a hash v1 could not read is null; one with no title has an empty title (v1 returns quietly)", () => {
    for (const b of FX.bad) {
      if (!b.hash.startsWith("#capture=")) continue;
      const d = decodeCapture(raw(b.hash));
      if (b.toasts[0] === CAPTURE_UNREADABLE) expect(d, b.id).toBeNull();
      else { expect(d, b.id).not.toBeNull(); expect(d!.title, b.id).toBe(""); }
    }
    expect(FX.bad.filter((b) => b.toasts[0] === CAPTURE_UNREADABLE).map((b) => b.id)).toEqual(["not-base64", "not-json", "empty-capture"]);
  });
});

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
      fileCapture(rec, { lib: stored, update, toast });
      expect(stored).toEqual(c.accepted.libAfter);
      expect(toast.mock.calls.map((x) => x[0])).toEqual(c.accepted.toasts);
      toast.mockClear();
      fileCapture(rec, { lib: stored, update, toast });
      expect(stored).toEqual(c.again.libAfter);
      expect(toast.mock.calls.map((x) => x[0])).toEqual(c.again.toasts);
      expect(c.again.toasts).toEqual([ALREADY_IN_LIBRARY]);
    });
  }
  it("a broken library the student keeps is left alone, with no toast", () => {
    const toast = vi.fn();
    fileCapture(captureRecord(decodeCapture(raw(FX.captures[0]!.hash))!), { lib: [], update: () => false, toast });
    expect(toast).not.toHaveBeenCalled();
  });
});

describe("<CaptureHash/>: the load-time check", () => {
  const roots: Root[] = [];
  let stored: CitationEntry[] = [];
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
    h.library = {
      lib: stored, ready: true, loading: false, locked: false,
      update: vi.fn((fn: (p: CitationEntry[]) => CitationEntry[]) => { stored = fn(stored); h.library = { ...h.library, lib: stored }; return true; })
    };
    h.toast.mockReset();
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
