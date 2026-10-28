// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import dock from "../messages/tools/dock.en.json";

/*
 * Task 13 (ruling P4, R2 section 8 option B): the AI pane beside the text in the Writing place is a column that can be resized with `dockW` (v1's
 * dock, 320 to 760, default 420). The handle is the document's width handle (documentBeside) on the other side: the pane is the right column, so
 * left is wider. The card is the real one; its editor, bar and AI pane contents are stand-ins, and the container's width is stubbed (jsdom has no layout).
 */

const h = vi.hoisted(() => ({
  update: vi.fn(), settings: {} as Record<string, unknown>, wide: true, cw: 1400,
  sug: { status: "done", text: "A read.", setEditor: () => {}, tab: () => false } as Record<string, unknown>,
  ws: null as unknown
}));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u-aside" }, settings: h.settings, update: h.update }) }));
vi.mock("@/lib/ai/useKeys", () => ({ useKeys: () => ({ hasKey: () => false }) }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => h.sug }));
vi.mock("@/lib/vault/titles", () => ({ fileTitle: (s: string) => s, useTitle: () => "document" }));
// The card holds the photo studio host, which reads the vault's status (to size a picture); a card with no editor never uses it.
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: "off" }) }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => h.ws }));
vi.mock("@/components/editor/Editor", () => ({ Editor: () => <div data-testid="editor-stub" /> }));
vi.mock("@/components/document/DocBar", () => ({ DocBar: () => null }));
vi.mock("@/components/tools/AiPane", () => ({ AiPane: () => <div data-testid="ai-pane-stub" /> }));

import { DocumentCard } from "../components/document/DocumentCard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
let root: Root;
let rect: ReturnType<typeof vi.spyOn>;
const SAVED_MATCH_MEDIA = window.matchMedia;

beforeEach(() => {
  h.update.mockReset().mockImplementation(async (patch: Record<string, unknown>) => { h.settings = { ...h.settings, ...patch }; });
  h.settings = {}; h.wide = true; h.cw = 1400;
  h.sug = { status: "done", text: "A read.", setEditor: () => {}, tab: () => false };
  h.ws = { currentDoc: { id: "d1", projectId: "p1", bodyHtml: "<p>x</p>", currentSeq: 1, deks: [] }, place: { stage: "writing", tab: null }, registerFlush: vi.fn(), registerEditor: vi.fn(), setWordCount: vi.fn(), startImport: vi.fn(), closeDocument: vi.fn() };
  // Only the card's grid is measured; every other box has no size, as in jsdom.
  rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const width = this.classList.contains("doc-with-aside") ? h.cw : 0;
    return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: 0, width, height: 0, toJSON: () => ({}) } as DOMRect;
  });
  window.matchMedia = ((q: string) => ({ matches: q === "(min-width: 1100px)" && h.wide, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  rect.mockRestore();
  window.matchMedia = SAVED_MATCH_MEDIA;
});

async function mount() {
  root = createRoot(document.body.appendChild(document.createElement("div")));
  roots.push(root);
  await act(async () => { root.render(<DocumentCard />); });
}
/** The settings mock applies a patch to `h.settings`; the card reads them again on its next render. */
const rerender = () => { act(() => { root.render(<DocumentCard />); }); };
const handle = () => document.querySelector<HTMLElement>('[data-testid="aside-resize"]');
const grid = () => document.querySelector<HTMLElement>(".doc-with-aside")!;
const asideW = () => grid().style.getPropertyValue("--aside-w");
const now = () => handle()!.getAttribute("aria-valuenow");
/** jsdom has no PointerEvent: a mouse event of the pointer type carries the position, and a pointer id as the browser's does. */
function pointer(type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel", clientX: number) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX });
  Object.defineProperty(e, "pointerId", { value: 7 });
  act(() => { handle()!.dispatchEvent(e); });
}
function key(k: string): boolean {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
  act(() => { handle()!.dispatchEvent(e); });
  return e.defaultPrevented;
}

describe("the AI pane's width handle", () => {
  it("is a labelled vertical separator in 320 to 760 that starts at 420 when dockW is not set", async () => {
    await mount();
    const el = handle()!;
    expect(el).not.toBeNull();
    expect(grid().classList.contains("has-aside")).toBe(true);
    expect(el.getAttribute("role")).toBe("separator");
    expect(el.getAttribute("aria-orientation")).toBe("vertical");
    expect(el.getAttribute("aria-label")).toBe(dock.dock_aside_width);
    expect(dock.dock_aside_width).toBe("AI pane width");
    expect(el.getAttribute("aria-valuemin")).toBe("320");
    expect(el.getAttribute("aria-valuemax")).toBe("760");
    expect(now()).toBe("420");
    expect(el.tabIndex).toBe(0);
    expect(asideW()).toBe("420px");
    // It sits in the card's grid, between the text and the pane.
    expect(el.previousElementSibling?.tagName).toBe("SECTION");
    expect(el.nextElementSibling?.getAttribute("data-testid")).toBe("doc-aside");
  });

  it("shows the saved dockW, and clamps a stored value outside 320 to 760 on load", async () => {
    h.settings = { dockW: 600 };
    await mount();
    expect(now()).toBe("600");
    expect(asideW()).toBe("600px");
    h.settings = { dockW: 900 };
    rerender();
    expect(now()).toBe("760");
    h.settings = { dockW: 100 };
    rerender();
    expect(now()).toBe("320");
    // Showing a clamped value saves nothing.
    expect(h.update).not.toHaveBeenCalled();
  });

  it("a drag sets --aside-w live (left is wider), saves nothing until release, then calls update once with the final width", async () => {
    await mount();
    const el = handle()!;
    el.setPointerCapture = vi.fn();
    pointer("pointerdown", 1000);
    expect(el.setPointerCapture).toHaveBeenCalledWith(7);
    pointer("pointermove", 900);
    expect(asideW()).toBe("520px");
    expect(now()).toBe("520");
    pointer("pointermove", 940);
    expect(asideW()).toBe("480px");
    expect(h.update).not.toHaveBeenCalled();
    pointer("pointermove", 880);
    expect(asideW()).toBe("540px");
    pointer("pointerup", 880);
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith({ dockW: 540 });
    // The saved width is what shows once the drag is over.
    rerender();
    expect(now()).toBe("540");
    expect(asideW()).toBe("540px");
    // Moving the pointer after release does nothing.
    pointer("pointermove", 100);
    expect(now()).toBe("540");
  });

  it("a drag clamps at 320 and at 760", async () => {
    await mount();
    pointer("pointerdown", 1000);
    pointer("pointermove", -2000);
    expect(asideW()).toBe("760px");
    expect(now()).toBe("760");
    pointer("pointermove", 5000);
    expect(asideW()).toBe("320px");
    expect(now()).toBe("320");
    pointer("pointerup", 5000);
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith({ dockW: 320 });
    // And the other end.
    rerender();
    pointer("pointerdown", 1000);
    pointer("pointermove", -2000);
    pointer("pointerup", -2000);
    expect(h.update).toHaveBeenLastCalledWith({ dockW: 760 });
    expect(h.update).toHaveBeenCalledTimes(2);
  });

  it("a press and release without a move, a drag back to where it began, or a cancelled drag saves nothing", async () => {
    h.settings = { dockW: 500 };
    await mount();
    pointer("pointerdown", 1000);
    pointer("pointerup", 1000);
    pointer("pointerdown", 1000);
    pointer("pointermove", 800);
    pointer("pointermove", 1000);
    pointer("pointerup", 1000);
    expect(h.update).not.toHaveBeenCalled();
    pointer("pointerdown", 1000);
    pointer("pointermove", 800);
    expect(now()).toBe("700");
    pointer("pointercancel", 800);
    expect(now()).toBe("500");
    expect(asideW()).toBe("500px");
    pointer("pointerup", 800);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("Arrow Left makes it 40px wider and Arrow Right 40px narrower, Home takes the widest, End the narrowest; each press saves", async () => {
    await mount();
    expect(key("ArrowLeft")).toBe(true);
    expect(h.update).toHaveBeenLastCalledWith({ dockW: 460 });
    rerender();
    expect(now()).toBe("460");
    key("ArrowLeft");
    expect(h.update).toHaveBeenLastCalledWith({ dockW: 500 });
    rerender();
    expect(key("ArrowRight")).toBe(true);
    expect(h.update).toHaveBeenLastCalledWith({ dockW: 460 });
    rerender();
    key("Home");
    expect(h.update).toHaveBeenLastCalledWith({ dockW: 760 });
    rerender();
    expect(now()).toBe("760");
    key("End");
    expect(h.update).toHaveBeenLastCalledWith({ dockW: 320 });
    rerender();
    expect(now()).toBe("320");
    expect(h.update).toHaveBeenCalledTimes(5);
  });

  it("a key at its end, or a key that is not the handle's, saves nothing and is left alone", async () => {
    h.settings = { dockW: 760 };
    await mount();
    expect(key("ArrowLeft")).toBe(true);
    expect(key("Home")).toBe(true);
    h.settings = { dockW: 320 };
    rerender();
    key("ArrowRight");
    key("End");
    expect(h.update).not.toHaveBeenCalled();
    // A step near the edge stops at the edge.
    h.settings = { dockW: 740 };
    rerender();
    key("ArrowLeft");
    expect(h.update).toHaveBeenLastCalledWith({ dockW: 760 });
    expect(key("Tab")).toBe(false);
    expect(key("a")).toBe(false);
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it("is not there under 1100px, though the pane is", async () => {
    h.wide = false;
    await mount();
    expect(document.querySelector('[data-testid="doc-aside"]')).not.toBeNull();
    expect(grid().classList.contains("has-aside")).toBe(true);
    expect(handle()).toBeNull();
    expect(asideW()).toBe("");
  });

  it("is not there when the document is beside a place, though the pane is", async () => {
    h.ws = { ...(h.ws as object), place: { stage: "lit", tab: null } };
    await mount();
    expect(grid().classList.contains("beside")).toBe(true);
    expect(document.querySelector('[data-testid="doc-aside"]')).not.toBeNull();
    expect(handle()).toBeNull();
    expect(asideW()).toBe("");
  });

  it("is there in the Writing place, which shows the document at full width", async () => {
    await mount();
    expect(grid().classList.contains("beside")).toBe(false);
    expect(handle()).not.toBeNull();
  });

  it("is not there on the project's home, where the document is hidden: it is measured once Writing is open, not before", async () => {
    // The home shows no document, so nothing there has a width; going on to Writing must measure then (1000 - 480 - 16 = 504), not keep a stale 760.
    h.cw = 1000;
    h.settings = { dockW: 760 };
    h.ws = { ...(h.ws as object), place: null };
    await mount();
    expect(handle()).toBeNull();
    expect(asideW()).toBe("");
    h.ws = { ...(h.ws as object), place: { stage: "writing", tab: null } };
    rerender();
    expect(handle()!.getAttribute("aria-valuemax")).toBe("504");
    expect(now()).toBe("504");
    expect(asideW()).toBe("504px");
    expect(h.update).not.toHaveBeenCalled();
  });

  it("is not there when there is no pane to resize", async () => {
    h.sug = { status: "idle", text: null, setEditor: () => {}, tab: () => false };
    await mount();
    expect(document.querySelector('[data-testid="doc-aside"]')).toBeNull();
    expect(grid().classList.contains("has-aside")).toBe(false);
    expect(handle()).toBeNull();
    // A pane that arrives gets its handle.
    h.sug = { status: "done", text: "A read.", setEditor: () => {}, tab: () => false };
    rerender();
    expect(handle()).not.toBeNull();
  });

  it("on a narrow container the widest it can be leaves the text 480px and the gap: a saved width is shown clamped down and not saved back", async () => {
    // 1000 - 480 - 16 (the grid's gap) = 504.
    h.cw = 1000;
    h.settings = { dockW: 600 };
    await mount();
    expect(now()).toBe("504");
    expect(handle()!.getAttribute("aria-valuemax")).toBe("504");
    expect(asideW()).toBe("504px");
    expect(h.update).not.toHaveBeenCalled();
    // A drag cannot go past it, and a release at the clamp stores what the student sees.
    pointer("pointerdown", 1000);
    pointer("pointermove", -2000);
    expect(now()).toBe("504");
    pointer("pointermove", 1004);
    expect(now()).toBe("500");
    pointer("pointerup", 1004);
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith({ dockW: 500 });
  });

  it("on a narrow container the keys work from what is shown: no step past the widest, Home goes to it, and nothing is saved while it does not change", async () => {
    h.cw = 1000;
    h.settings = { dockW: 600 };
    await mount();
    key("ArrowLeft");
    key("Home");
    expect(h.update).not.toHaveBeenCalled();
    key("ArrowRight");
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenLastCalledWith({ dockW: 464 });
    rerender();
    key("Home");
    expect(h.update).toHaveBeenLastCalledWith({ dockW: 504 });
    key("End");
    expect(h.update).toHaveBeenLastCalledWith({ dockW: 320 });
  });

  it("a container with a fractional width (browser zoom) gives whole pixels: the widest is rounded down and only integers reach update", async () => {
    // 1000.6 - 480 - 16 = 504.6: the API takes whole numbers for dockW, so the widest is 504.
    h.cw = 1000.6;
    h.settings = { dockW: 600 };
    await mount();
    expect(handle()!.getAttribute("aria-valuemax")).toBe("504");
    expect(now()).toBe("504");
    key("ArrowRight");
    expect(h.update).toHaveBeenLastCalledWith({ dockW: 464 });
    rerender();
    key("Home");
    expect(h.update).toHaveBeenLastCalledWith({ dockW: 504 });
    rerender();
    pointer("pointerdown", 1000);
    pointer("pointermove", -2000);
    expect(now()).toBe("504");
    pointer("pointerup", -2000);
    for (const [patch] of h.update.mock.calls as [{ dockW: number }][]) expect(Number.isInteger(patch.dockW)).toBe(true);
  });

  it("a drag past the widest on a fractional container stores a whole number", async () => {
    h.cw = 1000.6;
    h.settings = { dockW: 400 };
    await mount();
    pointer("pointerdown", 1000);
    pointer("pointermove", -2000);
    pointer("pointerup", -2000);
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith({ dockW: 504 });
  });

  it("measures again when the grid itself changes size, where the browser can tell (ResizeObserver)", async () => {
    const seen: { cb: () => void; el: Element }[] = [];
    const was = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class { constructor(private cb: () => void) {} observe(el: Element) { seen.push({ cb: this.cb, el }); } unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
    try {
      h.cw = 1000;
      h.settings = { dockW: 600 };
      await mount();
      expect(now()).toBe("504");
      expect(seen).toHaveLength(1);
      expect(seen[0]!.el).toBe(grid());
      h.cw = 1400;
      act(() => { seen[0]!.cb(); });
      expect(now()).toBe("600");
    } finally { globalThis.ResizeObserver = was; }
  });

  it("measures again when the window is resized: a pane clamped down widens back toward its saved width", async () => {
    h.cw = 1000;
    h.settings = { dockW: 600 };
    await mount();
    expect(now()).toBe("504");
    h.cw = 1400;
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(now()).toBe("600");
    expect(handle()!.getAttribute("aria-valuemax")).toBe("760");
    h.cw = 700;
    act(() => { window.dispatchEvent(new Event("resize")); });
    // Never under 320, however small the container.
    expect(now()).toBe("320");
    expect(handle()!.getAttribute("aria-valuemax")).toBe("320");
    expect(h.update).not.toHaveBeenCalled();
  });

  it("a container with no size (no layout yet) puts no limit but 760", async () => {
    h.cw = 0;
    h.settings = { dockW: 760 };
    await mount();
    expect(now()).toBe("760");
    expect(handle()!.getAttribute("aria-valuemax")).toBe("760");
  });
});
