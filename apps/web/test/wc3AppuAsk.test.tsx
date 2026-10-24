// @vitest-environment jsdom
// Task C3: Ask Appu inside the Guide, against fixture sections and a fake callAI (no network, no providers).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuideDialog, useGuideApi } from "@/components/help/guide/GuideDialog";
import { AskAppu } from "@/components/help/guide/AskAppu";
import { GuideSlot } from "@/components/help/slots/GuideSlot";
import { AiCallError } from "@/lib/ai/callAI";
import { keyStore } from "@/lib/ai/keys";
import { DICTS } from "@/lib/i18n";
import type { GuideSection } from "@/lib/help/guide/types";

const h = vi.hoisted(() => ({
  callAI: vi.fn(),
  keys: null as null | { hasKey(p: string): boolean; loaded: boolean },
  path: "/p/p-secret-id/writing/words" as string | null
}));
// Task C3 mounts Ask Appu in the Guide, so the Guide's own tests (wc2GuideDialog) mock these too: the hooks need the workspace's providers.
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => h.callAI }));
vi.mock("@/lib/ai/useKeys", () => ({ useKeysIfProvided: () => h.keys }));
vi.mock("next/navigation", () => ({ usePathname: () => h.path }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIX: GuideSection[] = [
  { id: "start", group: "Begin", title: "Getting started", keywords: "begin first", html: "<p>Make a project, then open Idea.</p>" },
  { id: "consent", group: "Begin", title: "Consent", keywords: "participant sign", html: "<p>Ask every participant to sign first.</p>" },
  { id: "alpha", group: "Tools", title: "Reading a test", keywords: "alpha significance", html: "<p>Set alpha before you look. Consent matters here too.</p>" },
  { id: "backup", group: "Help", title: "Backing up", keywords: "export", html: "<p>Export your work.</p>" },
  { id: "reverse", group: "Tools", title: "Scales", keywords: "reverse-score items", html: "<p>Reverse-score the negative items.</p>" }
];

let roots: Root[] = [];
beforeEach(() => {
  h.callAI.mockReset();
  h.keys = { hasKey: () => true, loaded: true };
  h.path = "/p/p-secret-id/writing/words";
});
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
const sectionIds = () => sections().map((s) => s.getAttribute("data-testid")!.slice("guide-section-".length));
const dialog = (extra: React.ReactNode = <AskAppu />) => draw(<GuideDialog open onClose={() => {}} sections={FIX} extra={extra} />);
const ask = async (question: string) => {
  type(q("appu-q") as HTMLInputElement, question);
  await act(async () => { q("appu-go")!.click(); });
};
const text = (id: string) => q(id)?.textContent ?? "";
const EN = DICTS.en;

describe("the Ask Appu box", () => {
  it("is drawn between the search row and the counter, with v1's label, example, button and the note", () => {
    dialog();
    const box = q("appu-box")!;
    expect(box).not.toBeNull();
    expect(box.textContent).toContain("Ask Appu");
    expect((q("appu-q") as HTMLInputElement).placeholder).toBe("For example: how do I reverse-score items?");
    expect(q("appu-go")!.textContent).toBe("Ask");
    expect(text("appu-note")).toBe(
      "Appu answers only from this guide. It cannot see your documents or data. Your question goes to your AI provider through Appuscholar's server, so leave out participant details."
    );
    expect(q("guide-search")!.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(box.compareDocumentPosition(q("guide-count")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // the label belongs to the question box
    const label = box.querySelector("label")!;
    expect(label.htmlFor).toBe(q("appu-q")!.id);
    expect(q("appu-answer")).toBeNull();
  });
  it("is what the Guide button's dialog carries (GuideSlot plugs it in through `extra`)", () => {
    draw(<GuideSlot />);
    act(() => { q("help-guide")!.click(); });
    expect(q("appu-box")).not.toBeNull();
  });
  it("opening the Guide again starts with an empty question and no answer", async () => {
    draw(<GuideSlot />);
    act(() => { q("help-guide")!.click(); });
    h.callAI.mockResolvedValue("An answer.");
    await ask("alpha");
    expect(q("appu-answer")).not.toBeNull();
    act(() => { q("guide-close")!.click(); });
    act(() => { q("help-guide")!.click(); });
    expect((q("appu-q") as HTMLInputElement).value).toBe("");
    expect(q("appu-answer")).toBeNull();
  });
  it("an empty question does nothing: no answer box, no request, the list as it was", async () => {
    dialog();
    await ask("   ");
    expect(q("appu-answer")).toBeNull();
    expect(h.callAI).not.toHaveBeenCalled();
    expect(sections().length).toBe(5);
  });
  it("Enter in the question box asks; Enter during a composition does not", async () => {
    h.callAI.mockResolvedValue("An answer.");
    dialog();
    const box = q("appu-q") as HTMLInputElement;
    type(box, "what is alpha");
    await act(async () => { box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true })); });
    expect(h.callAI).not.toHaveBeenCalled();
    await act(async () => { box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(h.callAI).toHaveBeenCalledTimes(1);
  });
});

describe("no section matches", () => {
  it("shows v1's line (the search box is above, in v2 as in v1) and sends nothing", async () => {
    dialog();
    await ask("zzzzqqqq wwwwxxxx");
    expect(text("appu-answer")).toBe("The guide has nothing on that. Try other words in the search box above, or press Report a problem in Help if something is broken.");
    expect(h.callAI).not.toHaveBeenCalled();
    expect(sections().length).toBe(5);
    expect(text("guide-count")).toBe("5 sections");
  });
  it("a question made only of short and stop words is the same", async () => {
    dialog();
    await ask("how can you use this?");
    expect(text("appu-answer")).toMatch(/^The guide has nothing on that\./);
    expect(h.callAI).not.toHaveBeenCalled();
  });
  it("asked again with words that match, the line gives way to the answer", async () => {
    h.callAI.mockResolvedValue("Set it before you look.");
    dialog();
    await ask("zzzzqqqq");
    await ask("alpha");
    expect(text("appu-text")).toBe("Set it before you look.");
    expect(text("appu-answer")).not.toContain("nothing on that");
  });
});

describe("no AI key", () => {
  it("lists the matching sections in the Guide, all open, under 'N sections match your question', and says why there is no answer", async () => {
    h.keys = { hasKey: () => false, loaded: true };
    dialog();
    type(q("guide-search") as HTMLInputElement, "export");
    await ask("Should I give consent forms to participants, and is alpha needed?");
    expect(h.callAI).not.toHaveBeenCalled();
    // consent scores 6 (title, keyword, body), alpha 4; the other three nothing. The list uses the dialog's groups: Begin, then Tools.
    const ids = sectionIds();
    expect(ids).toEqual(["consent", "alpha"]);
    expect(sections().every((d) => (d as HTMLDetailsElement).open)).toBe(true);
    expect(text("guide-count")).toBe("2 sections match your question");
    expect((q("guide-search") as HTMLInputElement).value).toBe("");
    const line = text("appu-answer");
    expect(line).toMatch(/^Appu needs an AI key to write an answer\. These guide sections match your question: .+\. They are listed below too\.$/);
    expect(all("[data-testid^=appu-link-]").map((a) => a.getAttribute("data-testid"))).toEqual(["appu-link-consent", "appu-link-alpha"]);
  });
  it("says '1 section matches your question' for one", async () => {
    h.keys = { hasKey: () => false, loaded: true };
    dialog();
    await ask("export");
    expect(sectionIds()).toEqual(["backup"]);
    expect(text("guide-count")).toBe("1 section matches your question");
  });
  it("the next keystroke in the search box ends the list and goes back to searching", async () => {
    h.keys = { hasKey: () => false, loaded: true };
    dialog();
    await ask("consent");
    expect(text("guide-count")).toMatch(/match your question$/);
    type(q("guide-search") as HTMLInputElement, "export");
    expect(sectionIds()).toEqual(["backup"]);
    expect(text("guide-count")).toBe("1 of 5 sections match");
    type(q("guide-search") as HTMLInputElement, "");
    expect(sections().length).toBe(5);
    expect(text("guide-count")).toBe("5 sections");
  });
  it("a key held for the provider only in this tab counts when the key list is not there", async () => {
    h.keys = null;
    const spy = vi.spyOn(keyStore, "getUnlocked").mockReturnValue("gsk_test");
    h.callAI.mockResolvedValue("ok");
    dialog();
    await ask("alpha");
    expect(h.callAI).toHaveBeenCalledTimes(1);
    spy.mockReturnValue(null);
    await ask("alpha");
    expect(h.callAI).toHaveBeenCalledTimes(1);
    expect(text("appu-answer")).toMatch(/^Appu needs an AI key/);
    spy.mockRestore();
  });
});

describe("while the saved keys are still being read", () => {
  it("a key saved in the account is not 'no key': Ask waits (button off, Enter does nothing, nothing listed) until the keys have loaded", async () => {
    h.keys = { hasKey: () => false, loaded: false };
    dialog();
    const box = q("appu-q") as HTMLInputElement;
    type(box, "alpha");
    expect((q("appu-go") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(h.callAI).not.toHaveBeenCalled();
    expect(q("appu-answer")).toBeNull();
    expect(sections().length).toBe(5);
    // the keys arrive: a locked key is a key, so the question is sent (the call asks for the passphrase)
    h.keys = { hasKey: () => true, loaded: true };
    h.callAI.mockResolvedValue("Set alpha first.");
    type(box, "alpha ");
    expect((q("appu-go") as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { q("appu-go")!.click(); });
    expect(h.callAI).toHaveBeenCalledTimes(1);
    expect(text("appu-text")).toBe("Set alpha first.");
  });
  it("a key already held in this tab needs no waiting", async () => {
    h.keys = { hasKey: () => true, loaded: false };
    h.callAI.mockResolvedValue("ok");
    const spy = vi.spyOn(keyStore, "getUnlocked").mockReturnValue("gsk_test");
    dialog();
    type(q("appu-q") as HTMLInputElement, "alpha");
    expect((q("appu-go") as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { q("appu-go")!.click(); });
    expect(h.callAI).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("the answer", () => {
  it("sends v1's prompt with the best sections and the open tool, at temperature 0.2, 700 tokens, without the language line", async () => {
    h.callAI.mockResolvedValue("Set alpha before you look at the data.");
    dialog();
    await ask("  What is alpha?  ");
    expect(h.callAI).toHaveBeenCalledTimes(1);
    const [prompt, opts] = h.callAI.mock.calls[0] as [string, Record<string, unknown>];
    expect(opts).toEqual({ temp: 0.2, max: 700, noLang: true });
    expect(prompt.startsWith("You are Appu, the help assistant")).toBe(true);
    expect(prompt).toContain("Tool currently open in the app: writing/words\n");
    expect(prompt).toContain("SECTION 1: Reading a test\n");
    expect(prompt.endsWith("STUDENT QUESTION:\nWhat is alpha?")).toBe(true);
    // the question and the guide are all there is: not the project's id, not a document
    expect(prompt).not.toContain("p-secret-id");
    expect(prompt).not.toContain("Getting started");
  });
  it("is plain text with 'From the guide: <links>. Appu can be wrong. Check the section.' under it", async () => {
    h.callAI.mockResolvedValue("  Set alpha first.\nThen run the test.  ");
    dialog();
    await ask("alpha");
    expect(text("appu-text")).toBe("Set alpha first.\nThen run the test.");
    expect(q("appu-text")!.className).toContain("whitespace-pre-wrap");
    const from = q("appu-from")!;
    expect(from.textContent).toMatch(/^From the guide: .+\. Appu can be wrong\. Check the section\.$/);
    expect(from.querySelector("[data-testid=appu-link-alpha]")!.textContent).toBe("Reading a test");
  });
  it("shows 'Appu is reading the guide…' and keeps the button off while the answer is on its way, then turns it back on", async () => {
    let finish!: (v: string) => void;
    h.callAI.mockReturnValue(new Promise<string>((r) => { finish = r; }));
    dialog();
    await ask("alpha");
    expect(text("appu-answer")).toBe("Appu is reading the guide…");
    expect((q("appu-go") as HTMLButtonElement).disabled).toBe(true);
    // a second press (or Enter) while it waits sends nothing more
    await act(async () => { (q("appu-q") as HTMLInputElement).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(h.callAI).toHaveBeenCalledTimes(1);
    await act(async () => { finish("Done."); });
    expect(text("appu-text")).toBe("Done.");
    expect((q("appu-go") as HTMLButtonElement).disabled).toBe(false);
  });
  it("never puts the answer in the page as HTML: an <img onerror> in it is text", async () => {
    h.callAI.mockResolvedValue('Look: <img src="x" onerror="window.__pwned=1"> and <script>window.__pwned=2</script> <b>bold</b>');
    dialog();
    await ask("alpha");
    const box = q("appu-answer")!;
    expect(box.querySelector("img")).toBeNull();
    expect(box.querySelector("script")).toBeNull();
    expect(box.querySelector("b")).toBeNull();
    expect(q("appu-text")!.textContent).toBe('Look: <img src="x" onerror="window.__pwned=1"> and <script>window.__pwned=2</script> <b>bold</b>');
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
  it("gives the answer box a height limit and its own scroll, so a long answer does not push the list away", async () => {
    h.callAI.mockResolvedValue("word ".repeat(400));
    dialog();
    await ask("alpha");
    const cls = q("appu-answer")!.className;
    // by the screen's height, not its width: a short laptop screen needs it as much as a phone
    expect(cls).toContain("max-h-[32dvh]");
    expect(cls).toContain("overflow-y-auto");
    expect(cls).not.toMatch(/\bsm:max-h/);
  });
  it("leaves the list as it was: an answer does not touch the search", async () => {
    h.callAI.mockResolvedValue("ok");
    dialog();
    type(q("guide-search") as HTMLInputElement, "export");
    await ask("alpha");
    expect(sectionIds()).toEqual(["backup"]);
    expect((q("guide-search") as HTMLInputElement).value).toBe("export");
  });
});

describe("when the call fails", () => {
  it("shows the sentence callAI gives for it, then 'These guide sections match your question: <links>.'", async () => {
    h.callAI.mockRejectedValue(new AiCallError("rate-limit", "Free limit reached for now. Wait a minute, or switch provider using the tabs at the top."));
    dialog();
    await ask("alpha");
    const line = text("appu-answer");
    expect(line).toMatch(/^Free limit reached for now\. Wait a minute, or switch provider using the tabs at the top\. These guide sections match your question: .+\.$/);
    expect(q("appu-link-alpha")).not.toBeNull();
    expect((q("appu-go") as HTMLButtonElement).disabled).toBe(false);
  });
  it("a student who cancels the personal-data question gets that sentence, and nothing was sent", async () => {
    h.callAI.mockRejectedValue(new AiCallError("cancelled", "Cancelled. Nothing was sent to the AI provider."));
    dialog();
    await ask("alpha");
    expect(text("appu-answer")).toMatch(/^Cancelled\. Nothing was sent to the AI provider\. These guide sections match/);
  });
  it("an error with no sentence of its own falls back to 'Appu could not answer.'", async () => {
    h.callAI.mockRejectedValue(new AiCallError("unknown", ""));
    dialog();
    await ask("alpha");
    expect(text("appu-answer")).toMatch(/^Appu could not answer\. These guide sections match your question: /);
  });
  it("a message that holds markup stays text", async () => {
    h.callAI.mockRejectedValue(new AiCallError("provider-error", 'Detail: <img src="x" onerror="window.__pwned=1">'));
    dialog();
    await ask("alpha");
    expect(q("appu-answer")!.querySelector("img")).toBeNull();
    expect(text("appu-answer")).toContain('<img src="x" onerror="window.__pwned=1">');
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
});

describe("a link in the answer", () => {
  it("sets the search box to the section's title and shows that section, open", async () => {
    h.callAI.mockResolvedValue("Set alpha first.");
    dialog();
    await ask("alpha");
    act(() => { q("appu-link-alpha")!.click(); });
    expect((q("guide-search") as HTMLInputElement).value).toBe("Reading a test");
    expect(sectionIds()).toContain("alpha");
    expect((q("guide-section-alpha") as HTMLDetailsElement).open).toBe(true);
    expect(text("guide-count")).toMatch(/^\d+ of 5 sections match$/);
    // the answer stays, with its links
    expect(text("appu-text")).toBe("Set alpha first.");
    expect(q("appu-link-alpha")).not.toBeNull();
  });
  it("opens the section even when its title's words are in more than three sections (v1 left them all closed)", async () => {
    const MANY: GuideSection[] = ["a", "b", "c", "d", "e"].map((x) => ({ id: "s" + x, group: "Tools" as const, title: "Section " + x, keywords: "", html: "<p>See also the section about alpha tests.</p>" }));
    MANY[0] = { id: "sa", group: "Tools", title: "About alpha tests", keywords: "", html: "<p>Alpha tests.</p>" };
    h.callAI.mockResolvedValue("ok");
    draw(<GuideDialog open onClose={() => {}} sections={MANY} extra={<AskAppu />} />);
    await ask("alpha tests");
    // five sections have 'about', 'alpha', 'tests' ... the title 'About alpha tests' matches all five
    act(() => { q("appu-link-sa")!.click(); });
    expect((q("guide-search") as HTMLInputElement).value).toBe("About alpha tests");
    expect(sections().length).toBeGreaterThan(3);
    expect((q("guide-section-sa") as HTMLDetailsElement).open).toBe(true);
    // typing again goes back to the search's own rule
    type(q("guide-search") as HTMLInputElement, "alpha");
    expect(sections().every((d) => !(d as HTMLDetailsElement).open)).toBe(true);
  });
  it("pressing the same link again reopens its section after it was closed, and brings it into view again", async () => {
    const scroll = vi.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scroll;
    h.callAI.mockResolvedValue("Set alpha first.");
    dialog();
    await ask("alpha");
    act(() => { q("appu-link-alpha")!.click(); });
    expect((q("guide-section-alpha") as HTMLDetailsElement).open).toBe(true);
    const first = scroll.mock.calls.length;
    expect(first).toBeGreaterThanOrEqual(1);
    // the student closes the section by its heading, then presses the link again
    (q("guide-section-alpha") as HTMLDetailsElement).open = false;
    act(() => { q("appu-link-alpha")!.click(); });
    expect((q("guide-section-alpha") as HTMLDetailsElement).open).toBe(true);
    expect(scroll.mock.calls.length).toBeGreaterThan(first);
    delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
  });
  it("a link from the no-key list ends that list and searches for the title", async () => {
    h.keys = { hasKey: () => false, loaded: true };
    dialog();
    await ask("export");
    expect(text("guide-count")).toBe("1 section matches your question");
    act(() => { q("appu-link-backup")!.click(); });
    expect(text("guide-count")).toBe("1 of 5 sections match");
    expect((q("guide-search") as HTMLInputElement).value).toBe("Backing up");
  });
});

describe("the dialog's small API for Ask Appu", () => {
  function Probe() {
    const api = useGuideApi();
    return (
      <div>
        <span data-testid="probe-n">{api.sections.length}</span>
        <button data-testid="probe-only" onClick={() => api.showOnly(["backup", "start", "nope"])} />
        <button data-testid="probe-query" onClick={() => api.setQuery("Consent")} />
        <button data-testid="probe-query-open" onClick={() => api.setQuery("e", "start")} />
      </div>
    );
  }
  it("hands out the sections the dialog shows", () => {
    dialog(<Probe />);
    expect(text("probe-n")).toBe("5");
  });
  it("showOnly lists just those sections (the ones that exist), open, in the dialog's groups, with its own counter, and clears the search box", () => {
    dialog(<Probe />);
    type(q("guide-search") as HTMLInputElement, "alpha");
    act(() => { q("probe-only")!.click(); });
    expect(sectionIds()).toEqual(["start", "backup"]);
    expect(sections().every((d) => (d as HTMLDetailsElement).open)).toBe(true);
    expect(text("guide-count")).toBe("2 sections match your question");
    expect((q("guide-search") as HTMLInputElement).value).toBe("");
    type(q("guide-search") as HTMLInputElement, "e");
    expect(text("guide-count")).toMatch(/^\d+ of 5 sections match$/);
  });
  it("setQuery fills the search box like typing does, and ends a pinned list", () => {
    dialog(<Probe />);
    act(() => { q("probe-only")!.click(); });
    act(() => { q("probe-query")!.click(); });
    expect((q("guide-search") as HTMLInputElement).value).toBe("Consent");
    expect(sectionIds()).toEqual(["consent", "alpha"]);
    expect(text("guide-count")).toBe("2 of 5 sections match");
  });
  it("setQuery with a section id keeps that section open though the search leaves it closed", () => {
    dialog(<Probe />);
    act(() => { q("probe-query-open")!.click(); });
    expect(sections().length).toBeGreaterThan(3);
    expect(sections().filter((d) => (d as HTMLDetailsElement).open).map((d) => d.getAttribute("data-testid"))).toEqual(["guide-section-start"]);
  });
  it("is not there outside the Guide", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => draw(<Probe />)).toThrow(/Guide/);
    err.mockRestore();
  });
});

describe("the dialog's layout with Ask Appu in it", () => {
  it("scrolls as a whole above the Close button, and the list keeps a floor of 8rem", () => {
    dialog();
    const scroller = q("guide-scroll")!;
    expect(scroller.className).toContain("overflow-y-auto");
    for (const id of ["guide-search", "appu-box", "guide-count", "guide-list"]) expect(scroller.contains(q(id)), id).toBe(true);
    expect(scroller.contains(q("guide-close"))).toBe(false);
    expect(q("guide-list")!.className).toContain("min-h-[8rem]");
    expect(q("guide-list")!.className).toContain("overflow-y-auto");
  });
  it("brings the list into view when Ask Appu pins sections (no key), so they are not left below the fold", async () => {
    const scroll = vi.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scroll;
    h.keys = { hasKey: () => false, loaded: true };
    dialog();
    await ask("export");
    expect(scroll).toHaveBeenCalled();
    expect(scroll.mock.contexts.some((el) => (el as HTMLElement).getAttribute?.("data-testid") === "guide-list")).toBe(true);
    delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
  });
});

describe("messages", () => {
  const keys = Object.keys(EN).filter((k) => k.startsWith("wc_appu_") || k === "wc_guide_count_asked" || k === "wc_guide_count_asked_one");
  it("every Ask Appu key has English and a Hindi draft, with the same {placeholders}", () => {
    expect(keys.length).toBeGreaterThanOrEqual(11);
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const k of keys) {
      expect(DICTS.hi[k], k).toBeTruthy();
      expect(holes(DICTS.hi[k]!), k).toEqual(holes(EN[k]!));
    }
  });
  it("the three lines that carry links hold {links} once, in both languages", () => {
    for (const k of ["wc_appu_nokey", "wc_appu_from", "wc_appu_error"]) {
      expect((EN[k]!.match(/\{links\}/g) ?? []).length, k).toBe(1);
      expect((DICTS.hi[k]!.match(/\{links\}/g) ?? []).length, k).toBe(1);
    }
  });
  it("has no em-dash and no emoji", () => {
    for (const k of keys) for (const d of [EN, DICTS.hi]) expect(d[k], k).not.toMatch(/\u2014|[\u{1F300}-\u{1FAFF}]/u);
  });
});
