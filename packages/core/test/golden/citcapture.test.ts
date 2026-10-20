import { describe, it, expect } from "vitest";
import type { CitationEntry } from "../../src/citation";
import { bookmarkletHref, bookmarkletSource, captureConfirmText, captureIsDuplicate, captureRecord, decodeCapture } from "../../src/citcapture";
import { readFixture } from "./harness/fixture";

/**
 * citcapture.ts (v1 citSetupBookmarklet 13622-13636, citCheckCaptureHash's decode, question, entry and duplicate rule 13644-13651) against v1 running. Every expected value is
 * read from test/golden/citshare/cases.json (`golden:capture citshare`): the bookmarklet's href at http://localhost/, the hash v1's bookmarklet opened the app with on each article
 * page (run in jsdom), and what v1's citCheckCaptureHash asked and saved for it, accepted, accepted again (the duplicate) and for the hashes it could not read.
 */
type Run = { confirms: string[]; toasts: string[]; libAfter: CitationEntry[]; href: string };
type Fx = {
  bookmarklet: { href: string; source: string };
  pages: Array<{ id: string; opened: Array<{ url: string; target: string }>; alerts: string[] }>;
  libBefore: CitationEntry[];
  captures: Array<{ id: string; hash: string; accepted: Run; again: Run; declined: Run }>;
  bad: Array<{ id: string; hash: string } & Run>;
};
const fx = readFixture<Fx>("citshare", "cases");
const raw = (hash: string) => hash.slice("#capture=".length);
const UNREADABLE = "Could not read that captured citation";

describe("the bookmarklet is v1's", () => {
  it("its source and href equal v1's for http://localhost/", () => {
    expect(bookmarkletSource("http://localhost/")).toBe(fx.bookmarklet.source);
    expect(bookmarkletHref("http://localhost/")).toBe(fx.bookmarklet.href);
  });
  it("on every article page v1's bookmarklet opened the app with a hash, or alerted for a page with no title", () => {
    expect(fx.pages.filter((p) => p.opened.length === 1).map((p) => p.id)).toEqual(fx.captures.map((c) => c.id));
    expect(fx.pages.find((p) => p.id === "nothing")!.alerts).toEqual(["No citation info found on this page — this works best on a journal article, PubMed, or arXiv page."]);
    for (const p of fx.pages) for (const o of p.opened) { expect(o.url.startsWith("http://localhost/#capture=")).toBe(true); expect(o.target).toBe("_blank"); }
  });
});

describe("decodeCapture, captureConfirmText and captureRecord equal v1's", () => {
  for (const c of fx.captures) {
    it(`${c.id}: the question v1 asked and the entry it saved`, () => {
      const d = decodeCapture(raw(c.hash));
      expect(d).not.toBeNull();
      expect(captureConfirmText(d!)).toBe(c.accepted.confirms[0]);
      expect(captureRecord(d!)).toEqual(c.accepted.libAfter[c.accepted.libAfter.length - 1]);
    });
  }
  it("a hash v1 could not read is null; one with no title has an empty title (v1 returns quietly)", () => {
    for (const b of fx.bad) {
      if (!b.hash.startsWith("#capture=")) continue;
      const d = decodeCapture(raw(b.hash));
      if (b.toasts[0] === UNREADABLE) expect(d, b.id).toBeNull();
      else { expect(d, b.id).not.toBeNull(); expect(d!.title, b.id).toBe(""); expect(b.confirms, b.id).toEqual([]); }
    }
    expect(fx.bad.filter((b) => b.toasts[0] === UNREADABLE).map((b) => b.id)).toEqual(["not-base64", "not-json", "empty-capture"]);
  });
});

describe("captureIsDuplicate is v1's rule (13651)", () => {
  for (const c of fx.captures) {
    it(`${c.id}: new over the library before, a duplicate over the one v1 left`, () => {
      const rec = captureRecord(decodeCapture(raw(c.hash))!);
      expect(captureIsDuplicate(fx.libBefore, rec)).toBe(false);
      expect(c.accepted.toasts[0]).not.toBe("Already in your library");
      expect(captureIsDuplicate(c.accepted.libAfter, rec)).toBe(true);
      expect(c.again.toasts).toEqual(["Already in your library"]);
    });
  }
  it("needs the same title and the same author", () => {
    const rec = { title: "T", author: "A" };
    expect(captureIsDuplicate([{ title: "T", author: "B" }, { title: "t", author: "A" }], rec)).toBe(false);
    expect(captureIsDuplicate([{ title: "T", author: "A", year: "1999" }], rec)).toBe(true);
  });
});
