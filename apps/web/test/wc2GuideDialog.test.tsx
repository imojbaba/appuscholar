// @vitest-environment jsdom
// Task C2: the Guide dialog and its Help button, against fixture sections.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuideDialog } from "@/components/help/guide/GuideDialog";
import { HelpButtons } from "@/components/help/HelpButtons";
import { GuideSlot } from "@/components/help/slots/GuideSlot";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { GUIDE } from "@/lib/help/guide/content";
import { DICTS } from "@/lib/i18n";
import type { GuideSection } from "@/lib/help/guide/types";

// Task C3 puts Ask Appu in the Guide's dialog (GuideSlot); its AI hook needs the workspace's providers, and these tests are about the dialog.
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => async () => "" }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIX: GuideSection[] = [
  { id: "start", group: "Begin", title: "Getting started", keywords: "begin first", html: "<p>Make a project.</p>" },
  { id: "consent", group: "Begin", title: "Consent", keywords: "participant", html: "<p>Ask first.</p>" },
  { id: "alpha", group: "Tools", title: "Reading a test", keywords: "alpha", html: "<p>Set alpha before you look.</p>" },
  { id: "backup", group: "Help", title: "Backing up", keywords: "export", html: "<p>Export your work.</p>" },
  { id: "evil", group: "Practice", title: "Hostile", keywords: "", html: '<p>safe text</p><img src="x" onerror="window.__pwned=1"><script>window.__pwned=2</script>' }
];

let roots: Root[] = [];
afterEach(() => { for (const r of roots) act(() => r.unmount()); roots = []; document.body.innerHTML = ""; delete (window as unknown as { __pwned?: number }).__pwned; });

function draw(node: React.ReactNode): void {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => { root.render(node); });
}
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const all = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];
function type(input: HTMLInputElement, value: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const sections = () => all("[data-testid^=guide-section-]");

describe("GuideDialog", () => {
  it("draws nothing while closed", () => {
    draw(<GuideDialog open={false} onClose={() => {}} sections={FIX} />);
    expect(q("guide-dialog")).toBeNull();
  });
  it("opens with the English-only banner, the search box with its placeholder, the counter, the contents grouped Begin, Tools, Practice, Help", () => {
    draw(<GuideDialog open onClose={() => {}} sections={FIX} />);
    expect(q("guide-dialog")).not.toBeNull();
    expect(q("guide-dialog")!.textContent).toContain("The guide is in English for now. A Hindi version is planned.");
    const box = q("guide-search") as HTMLInputElement;
    expect(box.placeholder).toBe("Search the guide, for example: alpha, consent, backup");
    expect(box.getAttribute("aria-label")).toBe("Search the guide");
    expect(q("guide-count")!.textContent).toBe("5 sections");
    expect(sections().length).toBe(5);
    expect(all("[data-testid^=guide-group-]").map((g) => g.getAttribute("data-testid"))).toEqual(["guide-group-Begin", "guide-group-Tools", "guide-group-Practice", "guide-group-Help"]);
    expect(q("guide-group-Begin")!.querySelectorAll("[data-testid^=guide-section-]").length).toBe(2);
    expect(sections().every((d) => !(d as HTMLDetailsElement).open)).toBe(true);
  });
  it("without a sections prop it lists the Guide's own sections", () => {
    draw(<GuideDialog open onClose={() => {}} />);
    expect(sections().length).toBe(GUIDE.length);
    expect(q("guide-count")!.textContent).toBe(`${GUIDE.length} sections`);
  });
  it("typing narrows the list, changes the counter, opens one to three matches", () => {
    draw(<GuideDialog open onClose={() => {}} sections={FIX} />);
    type(q("guide-search") as HTMLInputElement, "alpha");
    expect(sections().map((s) => s.getAttribute("data-testid"))).toEqual(["guide-section-alpha"]);
    expect(q("guide-count")!.textContent).toBe("1 of 5 sections match");
    expect((sections()[0] as HTMLDetailsElement).open).toBe(true);
    expect(q("guide-group-Begin")).toBeNull();
    type(q("guide-search") as HTMLInputElement, "");
    expect(sections().length).toBe(5);
    expect(q("guide-count")!.textContent).toBe("5 sections");
  });
  it("a query that matches nothing shows the empty line and no sections", () => {
    draw(<GuideDialog open onClose={() => {}} sections={FIX} />);
    type(q("guide-search") as HTMLInputElement, "qqqq");
    expect(sections().length).toBe(0);
    expect(q("guide-empty")!.textContent).toBe("Nothing in the guide matches that. Try one word, such as test or citation.");
    expect(q("guide-count")!.textContent).toBe("0 of 5 sections match");
  });
  it("a section's HTML cannot run script: no onerror, no script element, text kept", () => {
    draw(<GuideDialog open onClose={() => {}} sections={FIX} />);
    const body = q("guide-section-evil")!;
    expect(body.querySelector("script")).toBeNull();
    expect(body.innerHTML).not.toMatch(/onerror/i);
    expect(body.textContent).toContain("safe text");
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
  it("renders the extra slot below the search box", () => {
    draw(<GuideDialog open onClose={() => {}} sections={FIX} extra={<div data-testid="slot-extra">Ask Appu here</div>} />);
    const search = q("guide-search")!;
    const extra = q("slot-extra")!;
    expect(search.compareDocumentPosition(extra) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(extra.compareDocumentPosition(q("guide-count")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("Print opens a window, writes every section and the build id (not only the matches), then prints from the opener", () => {
    vi.useFakeTimers();
    const w = { document: { write: vi.fn(), close: vi.fn() }, focus: vi.fn(), print: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(w as unknown as Window);
    draw(<GuideDialog open onClose={() => {}} sections={FIX} />);
    type(q("guide-search") as HTMLInputElement, "alpha");
    act(() => { q("guide-print")!.click(); });
    expect(open).toHaveBeenCalledWith("", "_blank");
    const [written] = w.document.write.mock.calls[0] as [string];
    for (const s of FIX) expect(written).toContain(s.title);
    expect(written).toMatch(/Printed from the app\. Build \w+\./);
    expect(written).not.toMatch(/<script|onerror/i);
    expect(w.document.close).toHaveBeenCalled();
    expect(w.print).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(500); });
    expect(w.print).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    open.mockRestore();
  });
  it("a blocked pop-up says so inline", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    draw(<GuideDialog open onClose={() => {}} sections={FIX} />);
    act(() => { q("guide-print")!.click(); });
    expect(q("guide-print-note")!.textContent).toBe("Allow pop-ups for this page, then press Print again.");
    open.mockRestore();
  });
  it("calls onClose when the dialog is closed", () => {
    const onClose = vi.fn();
    draw(<GuideDialog open onClose={onClose} sections={FIX} />);
    act(() => { q("guide-close")!.click(); });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("GuideSlot", () => {
  it("draws the Guide button in the row Help renders (HelpButtons), with its icon and no dialog until pressed", () => {
    draw(<HelpButtons />);
    const btn = document.querySelector("[data-testid=help-wave-c] [data-testid=help-guide]") as HTMLElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe("Guide");
    expect(btn!.querySelector("svg")).not.toBeNull();
    expect(btn!.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    expect(q("guide-dialog")).toBeNull();
    act(() => { btn!.click(); });
    expect(q("guide-dialog")).not.toBeNull();
  });
  it("is a Guide button that opens the dialog", () => {
    draw(<GuideSlot />);
    expect(q("guide-dialog")).toBeNull();
    const btn = q("help-guide")!;
    expect(btn.textContent).toContain("Guide");
    act(() => { btn.click(); });
    expect(q("guide-dialog")).not.toBeNull();
    expect(q("guide-search")).not.toBeNull();
    expect(q("guide-count")).not.toBeNull();
  });
});

describe("the Guide over another dialog (as it opens from Help)", () => {
  const escape = () => act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  function drawHelpLike(): { closed: () => number } {
    let closed = 0;
    draw(
      <Dialog open onOpenChange={(o) => { if (!o) closed++; }}>
        <DialogContent data-testid="help-like">
          <DialogTitle>Help</DialogTitle>
          <DialogDescription>Help text</DialogDescription>
          <GuideSlot />
        </DialogContent>
      </Dialog>
    );
    return { closed: () => closed };
  }
  it("Escape closes only the Guide; the dialog under it stays open and gets its button's focus back", async () => {
    const help = drawHelpLike();
    const btn = q("help-guide")!;
    act(() => { btn.focus(); btn.click(); });
    expect(q("guide-dialog")).not.toBeNull();
    escape();
    expect(q("guide-dialog")).toBeNull();
    expect(q("help-like")).not.toBeNull();
    expect(help.closed()).toBe(0);
    // Radix hands focus back on the next tick.
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(document.activeElement).toBe(btn);
  });
  it("the Close button also ends only the Guide", () => {
    const help = drawHelpLike();
    act(() => { q("help-guide")!.click(); });
    act(() => { q("guide-close")!.click(); });
    expect(q("guide-dialog")).toBeNull();
    expect(q("help-like")).not.toBeNull();
    expect(help.closed()).toBe(0);
  });
  it("opening it again starts with an empty search", () => {
    drawHelpLike();
    act(() => { q("help-guide")!.click(); });
    type(q("guide-search") as HTMLInputElement, "alpha");
    act(() => { q("guide-close")!.click(); });
    act(() => { q("help-guide")!.click(); });
    expect((q("guide-search") as HTMLInputElement).value).toBe("");
  });
});

describe("messages", () => {
  it("every key the dialog uses is in the English dictionary and Hindi has the same keys", () => {
    const keys = Object.keys(DICTS.en).filter((k) => k.startsWith("wc_guide_"));
    expect(keys.length).toBeGreaterThan(10);
    for (const k of keys) expect(DICTS.hi[k], k).toBeTruthy();
    for (const k of keys) expect(DICTS.en[k], k).not.toMatch(/\u2014|[\u{1F300}-\u{1FAFF}]/u);
  });
});
