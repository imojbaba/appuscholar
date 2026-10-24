import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeChannel } from "./support/fakeChannel";
import {
  PHOTO_CHANNEL, STUDIO_ID_PATTERN, isPhotoMessage, isStudioId, newStudioId, onPhotoMessage, photoChannel, postPhoto, setPhotoChannel, studioHref, studioIdFromHash,
  type PhotoMessage
} from "../lib/popout/photoChannel";

/*
 * The photo studio's channel (wave D Task 7, R1 section 3a; v1 4558-4612): v1's name `appu_photo`, its five messages with their fields, ids that are safe
 * to put in a URL hash, and a guard so a message of any other shape is ignored (a closed or hostile window cannot make the opener write anything).
 */

afterEach(() => { setPhotoChannel(undefined); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const PNG = "data:image/png;base64,AAAA";

describe("PHOTO_CHANNEL and the channel itself (copy of lib/popout/channel.ts)", () => {
  it("is v1's name", () => { expect(PHOTO_CHANNEL).toBe("appu_photo"); });

  it("setPhotoChannel hands out a stand-in, null for none, and undefined opens the real one at next use", () => {
    const fake = new FakeChannel();
    setPhotoChannel(fake);
    expect(photoChannel()).toBe(fake);
    setPhotoChannel(null);
    expect(photoChannel()).toBeNull();
    // No window here (the default node environment): nothing to open.
    setPhotoChannel(undefined);
    expect(photoChannel()).toBeNull();
  });

  it("opens a BroadcastChannel named appu_photo once, unref'd so a Node process can exit", () => {
    const made: { name: string; unref: ReturnType<typeof vi.fn> }[] = [];
    class Fake {
      name: string; unref = vi.fn();
      constructor(name: string) { this.name = name; made.push(this); }
      postMessage() {} addEventListener() {} removeEventListener() {}
    }
    vi.stubGlobal("window", {});
    vi.stubGlobal("BroadcastChannel", Fake);
    setPhotoChannel(undefined);
    const c = photoChannel();
    expect(c).not.toBeNull();
    expect(photoChannel()).toBe(c);
    expect(made).toHaveLength(1);
    expect(made[0]!.name).toBe("appu_photo");
    expect(made[0]!.unref).toHaveBeenCalledTimes(1);
  });

  it("a browser with no BroadcastChannel has none (v1's catch)", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("BroadcastChannel", class { constructor() { throw new Error("nope"); } });
    setPhotoChannel(undefined);
    expect(photoChannel()).toBeNull();
  });
});

describe("isPhotoMessage", () => {
  const good: PhotoMessage[] = [
    { t: "ready", id: "ps1a2b" },
    { t: "load", id: "ps1a2b", src: PNG, capExists: false },
    { t: "load", id: "ps1a2b", src: "", capExists: false },
    { t: "done", id: "ps1a2b", src: PNG, edits: "bar, turned", capOn: true, title: "A title", note: "A note" },
    { t: "done", id: "ps1a2b", src: PNG, edits: "", capOn: false, title: "", note: "" },
    { t: "saved", id: "ps1a2b", ok: true },
    { t: "saved", id: "ps1a2b", ok: false },
    { t: "saved", id: "ps1a2b", ok: false, reason: "too-large" },
    { t: "saved", id: "ps1a2b", ok: false, reason: "no-document" },
    { t: "cancel", id: "ps1a2b" }
  ];
  it.each(good.map((m) => [JSON.stringify(m).slice(0, 60), m] as const))("accepts %s", (_n, m) => { expect(isPhotoMessage(m)).toBe(true); });

  const base = { t: "done", id: "ps1", src: PNG, edits: "", capOn: false, title: "", note: "" };
  const bad: [string, unknown][] = [
    ["null", null], ["a string", "ready"], ["a number", 3], ["an array", [{ t: "ready", id: "x" }]], ["no type", { id: "x" }], ["an unknown type", { t: "ping", id: "x" }],
    ["no id", { t: "ready" }], ["a numeric id", { t: "ready", id: 7 }], ["an empty id", { t: "ready", id: "" }], ["an id with a space", { t: "ready", id: "a b" }],
    ["an id with a dot", { t: "ready", id: "a.b" }], ["an id with a slash", { t: "ready", id: "../x" }], ["a 65 character id", { t: "ready", id: "a".repeat(65) }],
    ["a load with a web address for src", { t: "load", id: "x", src: "https://example.org/a.png", capExists: false }],
    ["a load with no capExists", { t: "load", id: "x", src: PNG }],
    ["a load whose capExists is a string", { t: "load", id: "x", src: PNG, capExists: "no" }],
    ["a done with an empty src", { ...base, src: "" }],
    ["a done with a script address", { ...base, src: "javascript:alert(1)" }],
    ["a done with a non-image data address", { ...base, src: "data:text/html;base64,AAAA" }],
    // The sanitizer keeps only png, jpeg, gif and webp base64 pictures in a document: anything else would vanish on save (Task 7 review).
    ["a done with an SVG picture", { ...base, src: "data:image/svg+xml;base64,PHN2Zz4=" }],
    ["a done with a picture that is not base64", { ...base, src: "data:image/png,AAAA" }],
    ["a done whose src is not a string", { ...base, src: 5 }],
    ["a done whose edits is not a string", { ...base, edits: ["bar"] }],
    ["a done whose capOn is not a boolean", { ...base, capOn: "yes" }],
    ["a done with no title", { t: "done", id: "x", src: PNG, edits: "", capOn: false, note: "" }],
    ["a done whose note is not a string", { ...base, note: null }],
    ["a saved with no ok", { t: "saved", id: "x" }],
    ["a saved whose ok is a string", { t: "saved", id: "x", ok: "true" }],
    ["a saved with an unknown reason", { t: "saved", id: "x", ok: false, reason: "because" }]
  ];
  it.each(bad)("rejects %s", (_n, m) => { expect(isPhotoMessage(m)).toBe(false); });
});

describe("ids", () => {
  it("newStudioId starts with v1's 'ps', fits the pattern, and two in one millisecond differ", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const ids = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const id = newStudioId();
      expect(id).toMatch(/^[\w-]{1,64}$/);
      expect(id.startsWith("ps")).toBe(true);
      ids.add(id);
    }
    expect(ids.size).toBe(2000);
  });

  it("the id pattern is the one the guard uses", () => {
    expect(STUDIO_ID_PATTERN.source).toBe("^[\\w-]{1,64}$");
    expect(isStudioId("ps-1_a")).toBe(true);
    expect(isStudioId("a b")).toBe(false);
    expect(isStudioId(12)).toBe(false);
  });

  it("studioHref puts the id in the hash, never in the query (v1's '#popout=photo&id=')", () => {
    expect(studioHref("ps1a")).toBe("/photo-studio#id=ps1a");
  });

  it("studioIdFromHash reads the id the way v1 does ([#&]id=([\\w-]+)), and nothing unsafe", () => {
    expect(studioIdFromHash("#id=ps1a")).toBe("ps1a");
    expect(studioIdFromHash("#x=1&id=ps1a&y=2")).toBe("ps1a");
    expect(studioIdFromHash("")).toBeNull();
    expect(studioIdFromHash("#")).toBeNull();
    expect(studioIdFromHash("#id=")).toBeNull();
    expect(studioIdFromHash("#id=" + "a".repeat(65))).toBeNull();
    expect(studioIdFromHash("#idx=ps1a")).toBeNull();
  });
});

describe("onPhotoMessage and postPhoto", () => {
  it("delivers valid messages, drops every other, and the unsubscribe stops it", () => {
    const ch = new FakeChannel();
    setPhotoChannel(ch);
    const got: PhotoMessage[] = [];
    const off = onPhotoMessage((m) => got.push(m));
    expect(ch.listening).toBe(1);
    ch.deliver({ t: "ready", id: "a1" });
    ch.deliver({ t: "ready", id: "no good" });
    ch.deliver("junk");
    ch.deliver(null);
    ch.deliver({ t: "cancel", id: "a1" });
    expect(got).toEqual([{ t: "ready", id: "a1" }, { t: "cancel", id: "a1" }]);
    off();
    expect(ch.listening).toBe(0);
    ch.deliver({ t: "ready", id: "a2" });
    expect(got).toHaveLength(2);
  });

  it("with no channel there is nothing to hear and posting does nothing", () => {
    setPhotoChannel(null);
    const off = onPhotoMessage(() => { throw new Error("never"); });
    expect(() => off()).not.toThrow();
    expect(() => postPhoto({ t: "ready", id: "a1" })).not.toThrow();
  });

  it("postPhoto posts the message, and a closed channel is not an error (the other window just never hears)", () => {
    const ch = new FakeChannel();
    setPhotoChannel(ch);
    postPhoto({ t: "saved", id: "a1", ok: false, reason: "too-large" });
    expect(ch.sent).toEqual([{ t: "saved", id: "a1", ok: false, reason: "too-large" }]);
    ch.throwOnPost = true;
    expect(() => postPhoto({ t: "ready", id: "a1" })).not.toThrow();
    expect(ch.sent).toHaveLength(1);
  });
});
