// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { FakeChannel } from "./support/fakeChannel";

const h = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import type { BlobKind } from "../lib/blobs/kinds";
import { POPOUT_FEATURES, POPOUT_WRITABLE, blobWritable, isPopout, openPopout, postInsert, setSyncChannel } from "../lib/popout/sync";

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

describe("openPopout (v1 popOutTool 7617-7622)", () => {
  it("opens /popout?tool=cite as the window appu_pop_cite, 540x820, and focuses it", () => {
    const focus = vi.fn();
    const open = vi.spyOn(window, "open").mockReturnValue({ focus } as unknown as Window);
    openPopout("cite", t);
    expect(open).toHaveBeenCalledWith("/popout?tool=cite", "appu_pop_cite", "popup=yes,width=540,height=820");
    expect(POPOUT_FEATURES).toBe("popup=yes,width=540,height=820");
    expect(focus).toHaveBeenCalledTimes(1);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("Research opens as appu_pop_research", () => {
    const open = vi.spyOn(window, "open").mockReturnValue({ focus: () => {} } as unknown as Window);
    openPopout("research", t);
    expect(open).toHaveBeenCalledWith("/popout?tool=research", "appu_pop_research", "popup=yes,width=540,height=820");
  });

  it("a blocked window says pop_blocked", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    openPopout("cite", t);
    expect(h.toast).toHaveBeenCalledWith(E.pop_blocked);
  });

  it("a window whose focus throws is still opened, with no toast (v1's try around w.focus())", () => {
    vi.spyOn(window, "open").mockReturnValue({ focus: () => { throw new Error("x"); } } as unknown as Window);
    openPopout("cite", t);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it.each(["idea", "chat", "analyse", "psych"])("%s says pop_unsupported and opens nothing", (tool) => {
    const open = vi.spyOn(window, "open");
    openPopout(tool, t);
    expect(open).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith(E.pop_unsupported);
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

describe("the pop-out's write guard (v1 POPOUT_WRITABLE 1964)", () => {
  it("is the pop-out on /popout only", () => {
    expect(isPopout()).toBe(false);
    window.history.replaceState(null, "", "/popout?tool=cite");
    expect(isPopout()).toBe(true);
  });
  it("writes only citations, retraction_cache and the shelf's papers there (R29: v1's shelf is IndexedDB, outside the guard); everything is writable in the writing window", () => {
    expect(POPOUT_WRITABLE).toEqual(["citations", "retraction_cache"]);
    expect((["citations", "retraction_cache", "idea_intake", "refcheck_cache", "ap_notes", "shelf_paper:a1"] as BlobKind[]).map((k) => blobWritable(k))).toEqual([true, true, true, true, true, true]);
    window.history.replaceState(null, "", "/popout?tool=research");
    expect((["citations", "retraction_cache", "idea_intake", "refcheck_cache", "ap_notes", "rs_prefs", "shelf_index", "shelf_cols", "ap_cols", "shelf_paper:a1"] as BlobKind[]).map((k) => blobWritable(k)))
      .toEqual([true, true, false, false, false, false, true, false, false, true]);
  });
});
