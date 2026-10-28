// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { FakeChannel } from "./support/fakeChannel";

const h = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { BLOB_KINDS, type BlobKind } from "../lib/blobs/kinds";
import { holdPopout, oldPopoutTarget } from "../lib/popout/mode";
import { POPOUT_FEATURES, blobWritable, isPopout, openPlaceWindow, popoutStage, postInsert, setSyncChannel, windowHref } from "../lib/popout/sync";

const E = en as Record<string, string>;
const t = (k: string) => E[k] ?? k;
let ch: FakeChannel;

beforeEach(() => {
  h.toast.mockReset();
  ch = new FakeChannel();
  setSyncChannel(ch);
  window.history.replaceState(null, "", "/");
});
afterEach(() => { setSyncChannel(undefined); vi.restoreAllMocks(); window.history.replaceState(null, "", "/"); });

describe("openPlaceWindow (v1 popOutTool 7617-7622, for any place)", () => {
  it("opens the place with ?window=1 as the window appu_pop_<stage>, 540x820, and focuses it", () => {
    const focus = vi.fn();
    const open = vi.spyOn(window, "open").mockReturnValue({ focus } as unknown as Window);
    openPlaceWindow("/p/p1/lit/citations", "lit", t);
    expect(open).toHaveBeenCalledWith("/p/p1/lit/citations?window=1", "appu_pop_lit", "popup=yes,width=540,height=820");
    expect(POPOUT_FEATURES).toBe("popup=yes,width=540,height=820");
    expect(focus).toHaveBeenCalledTimes(1);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("the Idea place opens as appu_pop_idea", () => {
    const open = vi.spyOn(window, "open").mockReturnValue({ focus: () => {} } as unknown as Window);
    openPlaceWindow("/p/p1/idea", "idea", t);
    expect(open).toHaveBeenCalledWith("/p/p1/idea?window=1", "appu_pop_idea", "popup=yes,width=540,height=820");
  });

  it("a blocked window says pop_blocked", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    openPlaceWindow("/p/p1/lit/find", "lit", t);
    expect(h.toast).toHaveBeenCalledWith(E.pop_blocked);
  });

  it("a window whose focus throws is still opened, with no toast (v1's try around w.focus())", () => {
    vi.spyOn(window, "open").mockReturnValue({ focus: () => { throw new Error("x"); } } as unknown as Window);
    openPlaceWindow("/p/p1/lit/find", "lit", t);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("windowHref keeps the query and the hash", () => {
    expect(windowHref("/p/p1/lit/find")).toBe("/p/p1/lit/find?window=1");
    expect(windowHref("/p/p1/lit/find?q=sleep#top")).toBe("/p/p1/lit/find?q=sleep&window=1#top");
    expect(windowHref("/p/p1?window=1")).toBe("/p/p1?window=1");
  });
});

describe("postInsert (v1 citInsertAtCursor's pop-out branch 7482-7484)", () => {
  it("posts the message on appu_sync and says pop_sent", () => {
    postInsert({ type: "insert", text: " (Bandura, 1977)" }, t);
    expect(ch.sent).toEqual([{ type: "insert", text: " (Bandura, 1977)" }]);
    expect(h.toast).toHaveBeenCalledWith(E.pop_sent);
  });

  it("a post that throws says pop_nowin", () => {
    ch.throwOnPost = true;
    postInsert({ type: "insert", text: "x" }, t);
    expect(h.toast).toHaveBeenCalledWith(E.pop_nowin);
  });

  it("with no channel at all v1 still says pop_sent (popChan&&… does not throw)", () => {
    setSyncChannel(null);
    postInsert({ type: "insert", text: "x" }, t);
    expect(h.toast).toHaveBeenCalledWith(E.pop_sent);
  });
});

describe("the pop-out's write guard, by stage (v1 POPOUT_WRITABLE 1964; register row D-S2-43)", () => {
  const at = (url: string) => window.history.replaceState(null, "", url);
  const LIT: BlobKind[] = ["citations", "retraction_cache", "refcheck_cache", "shelf_index", "ap_notes", "rs_prefs", "ap_cols", "shelf_cols", "shelf_paper:a1"];
  const EVERY = [...BLOB_KINDS, "shelf_paper:a1"] as BlobKind[];

  it("a window is a pop-out when its address carries ?window=1, and its stage comes from the path", () => {
    expect([isPopout(), popoutStage()]).toEqual([false, null]);
    at("/p/p1/lit/find?window=1");
    expect([isPopout(), popoutStage()]).toEqual([true, "lit"]);
    at("/p/p1/idea?window=1");
    expect(popoutStage()).toBe("idea");
    at("/p/p1?window=1");
    expect([isPopout(), popoutStage()]).toEqual([true, null]);
    at("/p/p1/lit/find?window=0");
    expect([isPopout(), popoutStage()]).toEqual([false, null]);
    // The old page is no pop-out any more: it only redirects.
    at("/popout?tool=cite");
    expect(isPopout()).toBe(false);
  });

  it("a Literature window writes refcheck_cache", () => {
    at("/p/p1/lit/citations?window=1");
    expect(blobWritable("refcheck_cache")).toBe(true);
    expect(LIT.map((k) => blobWritable(k))).toEqual(LIT.map(() => true));
    expect(blobWritable("idea_intake")).toBe(false);
  });

  it("an Idea window cannot write citations", () => {
    at("/p/p1/idea?window=1");
    expect(blobWritable("citations")).toBe(false);
    expect(LIT.map((k) => blobWritable(k))).toEqual(LIT.map(() => false));
    expect(blobWritable("idea_intake")).toBe(true);
  });

  it("a window on the project's home writes nothing; a Writing or Design window writes its own stage's kinds only; the writing window writes every kind", () => {
    at("/p/p1?window=1");
    expect(EVERY.some((k) => blobWritable(k))).toBe(false);
    // Task G3: Writing and Design and ethics have kinds of their own now (their tools'), and nothing else.
    at("/p/p1/writing?window=1");
    // Wave D's writing_samples is a Writing kind too; the capture itself never runs in a pop-out (lib/writingSamples).
    expect(EVERY.filter((k) => blobWritable(k))).toEqual(["style_profile", "style_samples", "style_meta", "words_bank", "words_prefs", "writing_samples"]);
    at("/p/p1/design?window=1");
    expect(EVERY.filter((k) => blobWritable(k))).toEqual(["design_reg", "design_proto", "design_ec", "design_ctri", "design_pi", "design_budget"]);
    at("/p/p1/lit/find");
    expect(EVERY.every((k) => blobWritable(k))).toBe(true);
  });

  it("a held pop-out stays one after a move that lost ?window=1, until its shell lets go", () => {
    at("/p/p1/lit/find?window=1");
    holdPopout(true);
    try {
      at("/p/p1/lit/reading");
      expect([isPopout(), popoutStage(), blobWritable("idea_intake"), blobWritable("ap_notes")]).toEqual([true, "lit", false, true]);
    } finally { holdPopout(false); }
    expect(isPopout()).toBe(false);
  });

  it("old pop-out links go to the matching Literature tab in a new-window place; anything else to the list", () => {
    expect(oldPopoutTarget("cite", "p1")).toBe("/p/p1/lit/citations?window=1");
    expect(oldPopoutTarget("research", "p1")).toBe("/p/p1/lit/find?window=1");
    for (const tool of [null, "", "chat", "analyse", "CITE"]) expect(oldPopoutTarget(tool, "p1")).toBe("/projects");
  });
});
