import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/messages/tools/help-install.en.json";
import hi from "@/messages/tools/help-install.hi.json";

/**
 * Task C8: the files the browser reads without running the app. public/offline.html cannot call t() (the worker serves it as a plain page, with no
 * script), so its words live in the message files too and this test keeps the page and the files saying the same thing, in both languages.
 */
const WEB = join(__dirname, "..");
const read = (p: string) => readFileSync(join(WEB, p));
const OFFLINE = read("public/offline.html").toString("utf8");
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("public/offline.html", () => {
  it("says its words in English and in Hindi (draft) side by side, the same words as the message files", () => {
    const keys = ["wc_offpage_tab", "wc_offpage_title", "wc_offpage_body", "wc_offpage_check", "wc_offpage_retry"] as const;
    const flat = text(OFFLINE);
    for (const k of keys) {
      expect(en[k], k).toBeTruthy();
      expect(hi[k], k).toBeTruthy();
      expect(flat, "en " + k).toContain(en[k].replace(/\s+/g, " "));
      expect(flat, "hi " + k).toContain(hi[k].replace(/\s+/g, " "));
    }
    expect(OFFLINE).toMatch(/<html lang="en">/);
    expect(OFFLINE).toMatch(/lang="hi"/);
    expect(OFFLINE).toMatch(/<title>[^<]*Appuscholar is offline[^<]*<\/title>/);
  });
  it("does not promise that nothing is lost: it says what has been saved is in the account", () => {
    expect(en.wc_offpage_body).toMatch(/What you have saved is stored in your account\./);
    expect(OFFLINE).not.toMatch(/nothing is lost/i);
    expect(en.wc_offpage_body).toMatch(/Saving, AI, paper search and new pages need a connection\./);
  });
  it("has no script of any kind, no em-dash and no emoji, and its picture is decoration", () => {
    expect(OFFLINE).not.toMatch(/<script|javascript:|\son[a-z]+\s*=/i);
    expect(OFFLINE).not.toMatch(new RegExp("\\u2014"));
    expect(OFFLINE).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(OFFLINE).toMatch(/<img [^>]*alt=""/);
  });
  it("tries again by reloading the address it was asked for, not by going to the start page", () => {
    // The worker answers the navigation with this page, so the document's address is the one asked for; an empty href resolves to it, query included.
    const links = [...OFFLINE.matchAll(/<a\s[^>]*>/g)].map((m) => m[0]);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatch(/\shref=""/);
    expect(links[0]).not.toMatch(/href="\/"/);
    expect(OFFLINE).toContain(en.wc_offpage_retry);
  });
  it("every English page word has a Hindi draft and the Hindi file carries the draft marker", () => {
    const offpage = Object.keys(en).filter((k) => k.startsWith("wc_offpage_")).sort();
    expect(Object.keys(hi).filter((k) => k.startsWith("wc_offpage_")).sort()).toEqual(offpage);
    expect(Object.keys(hi)[0]).toBe("$draft");
  });
});

describe("the app's icons", () => {
  const png = (p: string) => read(p);
  const size = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)];
  it("the favicon and the touch icon (app/icon.png, app/apple-icon.png) are v1's 192 px icon, as v1's head used for both", () => {
    const base = png("public/icon-192.png");
    expect(size(base)).toEqual([192, 192]);
    expect(png("app/icon.png").equals(base)).toBe(true);
    expect(png("app/apple-icon.png").equals(base)).toBe(true);
    expect(size(png("public/icon-512.png"))).toEqual([512, 512]);
  });
});
