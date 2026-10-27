// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STY_VOCAB, styleFeatures, type StyleSample } from "@appuscholar/core";
import en from "../messages/en.json";
import styleEn from "../messages/tools/style.en.json";

const h = vi.hoisted(() => ({
  store: {} as Record<string, unknown>,
  flags: {} as Record<string, { loading?: boolean; locked?: boolean; broken?: boolean }>,
  listeners: new Set<() => void>(),
  /** Every value ever handed to a blob's set(), after the update was applied: what would have gone to the server. */
  written: [] as Array<{ kind: string; value: unknown }>,
  docText: "",
  docHtml: null as string | null,
  docs: null as null | Array<{ id: string; title: string; text: string; html: string }>,
  editor: null as null | { isDestroyed: boolean; getHTML(): string },
  scan: null as null | import("../lib/ai/callAI").CallCtx,
  api: vi.fn(),
  ai: vi.fn(async (_prompt: string, _o: { temp: number; max: number }) => "- Plain, warm tone.\n- Short sentences."),
  toast: vi.fn()
}));
vi.mock("@/lib/blobs/useProjectBlob", async () => {
  const React = await import("react");
  return {
    useProjectBlob: (kind: string, id: string | null) => {
      const [, bump] = React.useState(0);
      React.useEffect(() => { const l = () => bump((n) => n + 1); h.listeners.add(l); return () => { h.listeners.delete(l); }; }, []);
      const set = React.useCallback((next: unknown) => {
        const v = typeof next === "function" ? (next as (p: unknown) => unknown)(h.store[kind] ?? null) : next;
        h.store[kind] = v;
        h.written.push({ kind, value: JSON.parse(JSON.stringify(v)) });
        for (const l of h.listeners) l();
      }, [kind]);
      if (id === null) return { value: null, loading: false, locked: false, set: () => {}, flush: async () => true, readOnly: false };
      const f = h.flags[kind] ?? {};
      return { value: f.locked || f.loading ? null : (h.store[kind] ?? null), loading: !!f.loading, locked: !!f.locked, broken: f.broken, set, flush: async () => true, readOnly: false };
    }
  };
});
// The hook is useCallAI's stand-in: h.ai answers, unless a test sets h.scan, which runs the real callAI (its personal-data step first) with that context.
vi.mock("@/lib/ai/useCallAI", async () => {
  const real = await vi.importActual<typeof import("../lib/ai/callAI")>("../lib/ai/callAI");
  return { useCallAI: () => (prompt: string, o: { temp: number; max: number }) => (h.scan ? real.callAI(prompt, o, h.scan) : h.ai(prompt, o)) };
});
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: (...a: unknown[]) => h.api(...a) }));
// In a place's own window text() is the writing window's mirror and allDocuments() lists the project's documents; the project context has no current document there.
vi.mock("@/lib/editor/docAccess", () => ({ useDocAccess: () => ({ text: () => h.docText, allDocuments: async () => h.docs ?? [{ id: "d1", title: "", text: h.docText, html: h.docHtml ?? "<p>" + h.docText + "</p>" }] }) }));
// The open document's editor: its HTML is what the panel learns from (the student's own words only, D-S2-89).
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: h.editor }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { Panel } from "../components/tools/style/Panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = { ...(en as Record<string, string>), ...(styleEn as Record<string, string>) };
const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const $$ = (id: string) => Array.from(document.body.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
const tick = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
/** Waits (the files are read through the browser's own readers, in as many turns as they take) until `pred` holds. */
async function until(pred: () => boolean, what = "condition") {
  for (let i = 0; i < 1000; i++) { if (pred()) return; await tick(5); }
  throw new Error("not reached: " + what);
}
// A learn starts after the document is read (an await), so give it a turn to begin before waiting for it to end.
const idle = async () => { await tick(10); await until(() => !$("style-learn")!.hasAttribute("disabled"), "the panel is idle again"); };

function mount(projectId = "p1"): Root {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const r = createRoot(el);
  roots.push(r);
  act(() => r.render(<Panel tab="style" projectId={projectId} />));
  return r;
}
const click = (id: string | HTMLElement) => act(() => { (typeof id === "string" ? $(id)! : id).click(); });
const textareaValue = (el: HTMLElement, value: string, inputType?: string) => act(() => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(inputType ? new InputEvent("input", { bubbles: true, inputType }) : new Event("input", { bubbles: true }));
});
const choose = (input: HTMLElement, files: File[]) => act(() => {
  Object.defineProperty(input, "files", { value: files, configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
});

/** About `n` words of plain English, in sentences of twelve. */
function prose(n: number, seed = 0): string {
  const w = ("method result student sleep memory reading evidence careful measure sample teacher classroom attention practice feedback pattern account " +
    "however because therefore although sometimes usually carefully important different between through without during another several general").split(" ");
  const out: string[] = [];
  for (let i = 0; i < n; i++) { const x = w[(i * 7 + seed * 3 + (i >> 3)) % w.length]!; out.push(i % 12 === 0 ? x[0]!.toUpperCase() + x.slice(1) : x); if (i % 12 === 11) out[out.length - 1] += "."; }
  return out.join(" ") + ".";
}
const file = (text: string, name: string) => new File([text], name);
const sample = (over: Partial<StyleSample> = {}): StyleSample => ({ id: "s1", name: "a.txt", date: "2026-10-21", ...styleFeatures(prose(300)), ...over });
const seed = (kind: string, value: unknown) => { h.store[kind] = value; };
const T = (k: string, vars?: Record<string, string | number>) => (E[k] ?? k).replace(/\{(\w+)\}/g, (m, v: string) => (vars && v in vars ? String(vars[v]) : m));

beforeEach(() => {
  h.store = {}; h.flags = {}; h.written = []; h.docText = ""; h.docHtml = null; h.docs = null; h.editor = { isDestroyed: false, getHTML: () => h.docHtml ?? "<p>" + h.docText + "</p>" }; h.ai.mockClear(); h.toast.mockClear();
  h.ai.mockImplementation(async () => "- Plain, warm tone.\n- Short sentences.");
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; vi.restoreAllMocks(); h.scan = null; });

describe("My style panel: declaration and learning", () => {
  it("shows the declaration box in v1's words, unticked, with no samples", () => {
    mount();
    expect($("style-declaration")!.textContent).toContain(T("sty2_own_title"));
    expect($("style-declaration")!.textContent).toContain(T("sty2_decl"));
    expect(($("style-decl") as HTMLInputElement).checked).toBe(false);
    expect($("style-summary")!.textContent).toContain(T("sty2_samples_n", { n: 0, w: 0 }) + " · " + T("sty2_not_declared"));
  });
  it("Learn from my writing: under 80 words says so first; 80 words without the declaration says that; neither asks the AI or stores a sample", async () => {
    mount();
    h.docText = prose(60);
    click("style-learn");
    await tick();
    expect($("style-status")!.textContent).toBe(T("sty2_need_words", { n: 80 }));
    h.docText = prose(120);
    click("style-learn");
    await tick();
    expect($("style-status")!.textContent).toBe(T("sty2_need_decl"));
    expect(h.ai).not.toHaveBeenCalled();
    expect(h.written).toEqual([]);
  });
  it("with the declaration ticked: stores today's date, sends v1's prompt, puts the bullets and a measured line in the profile, labels them as the AI's and turns the style on", async () => {
    mount();
    click("style-decl");
    expect((h.store.style_meta as { decl: string }).decl).toBe(new Date().toISOString().slice(0, 10));
    h.docText = prose(120);
    click("style-learn");
    await idle();
    expect(h.ai).toHaveBeenCalledOnce();
    expect(h.ai.mock.calls[0]![0].startsWith("Analyze the writing style of the text below.")).toBe(true);
    expect(h.ai.mock.calls[0]![1]).toEqual({ temp: 0.3, max: 600 });
    const p = h.store.style_profile as { profile: string; on: boolean };
    expect(p.on).toBe(true);
    expect(p.profile.startsWith("- Plain, warm tone.\n- Short sentences.\n- Measured from 1 sample (120 words):")).toBe(true);
    expect(($("style-profile") as HTMLTextAreaElement).value).toBe(p.profile);
    expect(($("style-on") as HTMLInputElement).checked).toBe(true);
    expect($("style-ai-label")!.textContent).toBe(T("sty2_ai_profile"));
    expect($("style-status")!.textContent).toBe(T("sty2_learned_doc"));
    expect($$("style-sample").map((x) => x.textContent)).toEqual([expect.stringContaining("Current document")]);
  });
  it("an AI error is shown as it came, the sample kept", async () => {
    mount();
    click("style-decl");
    h.docText = prose(100);
    h.ai.mockRejectedValueOnce(new Error("Cancelled. Nothing was sent to the AI provider."));
    click("style-learn");
    await idle();
    expect($("style-status")!.textContent).toBe("Cancelled. Nothing was sent to the AI provider.");
    expect($$("style-sample")).toHaveLength(1);
  });
  it("Learn from my files: refuses an undeclared set before reading any; then reads, shows 'Reading i of n', and learns", async () => {
    mount();
    choose($("style-files")!, [file(prose(90), "one.txt")]);
    expect($("style-status")!.textContent).toBe(T("sty2_need_decl_files"));
    expect(h.ai).not.toHaveBeenCalled();
    click("style-decl");
    choose($("style-files")!, [file(prose(90, 1), "one.txt"), file(prose(95, 2), "two.md")]);
    await idle();
    expect(h.ai).toHaveBeenCalledOnce();
    expect(h.ai.mock.calls[0]![0].startsWith("You are studying the writing style of ONE author")).toBe(true);
    expect(h.ai.mock.calls[0]![1]).toEqual({ temp: 0.3, max: 800 });
    expect($("style-status")!.textContent).toBe(T("sty2_learned_files", { files: 2, words: "185" }));
    expect($$("style-sample").map((x) => x.textContent!.split(" · ")[0]!.trim())).toEqual(["one.txt", "two.md"]);
  });
  it("file limits: the first 100 only, and a file over 25 MB is skipped and named", async () => {
    mount();
    click("style-decl");
    const many = Array.from({ length: 130 }, (_, i) => file(prose(85, i), `f${i}.txt`));
    const big = file("x", "huge.pdf");
    Object.defineProperty(big, "size", { value: 25 * 1024 * 1024 + 1 });
    choose($("style-files")!, [big, ...many]);
    await idle();
    expect(h.ai).toHaveBeenCalledOnce();
    const st = $("style-status")!.textContent!;
    expect(st).toContain(T("sty2_learned_files", { files: 99, words: "8,415" }).split(" Read ")[0]!.replace("99", "99"));
    expect(st).toContain("huge.pdf (" + T("sty2_too_big") + ")");
    expect($$("style-sample")).toHaveLength(99);
  }, 20000);
  it("too little text: says nothing could be read and names what was skipped; the AI is not asked", async () => {
    mount();
    click("style-decl");
    choose($("style-files")!, [file("just a few words", "tiny.txt"), file("old", "old.doc")]);
    await idle();
    expect($("style-status")!.textContent).toBe(T("sty2_few_text_skipped", { names: "old.doc" }));
    expect(h.ai).not.toHaveBeenCalled();
  });
  it("a list of 100 samples drops the newest and says so", async () => {
    seed("style_samples", Array.from({ length: 100 }, (_, i) => sample({ id: "s" + i, name: "f" + i })));
    mount();
    click("style-decl");
    h.docText = prose(100);
    click("style-learn");
    await idle();
    expect($$("style-sample")).toHaveLength(100);
    expect($("style-status")!.textContent).toContain(T("sty2_full"));
  });
});

describe("while a learn runs", () => {
  it("the profile box and Save profile are disabled, and are enabled again afterwards", async () => {
    mount();
    click("style-decl");
    h.docText = prose(100);
    let release!: (v: string) => void;
    h.ai.mockImplementationOnce(() => new Promise<string>((r) => { release = r; }));
    click("style-learn");
    await until(() => ($("style-learn") as HTMLButtonElement).disabled, "the learn has begun");
    expect(($("style-profile") as HTMLTextAreaElement).disabled).toBe(true);
    expect(($("style-save") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { release("- Plain tone."); });
    await idle();
    expect(($("style-profile") as HTMLTextAreaElement).disabled).toBe(false);
    expect(($("style-save") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("only the student's own words are learned from (D-S2-89)", () => {
  const html = (ai: string) => "<p>" + prose(100) + ' <span class="ai-ins" data-h="x">' + ai + "</span></p>";
  it("a word that only an AI span holds is in neither the prompt nor the sample's long words", async () => {
    mount();
    click("style-decl");
    h.docHtml = html("extraordinarilymarkerword notwithstanding the sophisticated additions");
    click("style-learn");
    await idle();
    expect(h.ai).toHaveBeenCalledOnce();
    expect(h.ai.mock.calls[0]![0]).not.toMatch(/extraordinarilymarkerword|sophisticated/);
    expect(h.ai.mock.calls[0]![0]).toContain("TEXT:\n" + prose(100).slice(0, 40));
    const samples = h.store.style_samples as StyleSample[];
    expect(samples).toHaveLength(1);
    expect(samples[0]!.vw).not.toContain("extraordinarilymarkerword");
    expect(samples[0]!.vw).not.toContain("sophisticated");
    expect(JSON.stringify(h.written)).not.toContain("extraordinarilymarkerword");
  });
  it("words inside an AI span do not count toward the 80 words", async () => {
    mount();
    click("style-decl");
    h.docHtml = "<p>" + prose(40) + '</p><p><span class="ai-ins">' + prose(100, 4) + "</span></p>";
    click("style-learn");
    await tick();
    expect($("style-status")!.textContent).toBe(T("sty2_need_words", { n: 80 }));
    expect(h.ai).not.toHaveBeenCalled();
  });
  it("the declaration copy stays", () => {
    mount();
    expect($("style-declaration")!.textContent).toContain("I wrote these samples myself, without AI and without copying from anyone.");
  });
  it("with no editor and no current document (a place's own window) the writing window's open document is found by the mirror's text, the AI span still left out", async () => {
    h.editor = null;
    mount();
    click("style-decl");
    // The mirror holds the text the writing window sees (AI span included); the other document is the project's first.
    h.docText = prose(100) + " zebraquartzmarker";
    h.docs = [
      { id: "d1", title: "", text: "Another document of this project.", html: "<p>Another document of this project.</p>" },
      { id: "d2", title: "", text: h.docText, html: html("zebraquartzmarker") }
    ];
    click("style-learn");
    await idle();
    expect(h.ai).toHaveBeenCalledOnce();
    expect(h.ai.mock.calls[0]![0]).toContain("TEXT:\n" + prose(100).slice(0, 40));
    expect(h.ai.mock.calls[0]![0]).not.toContain("zebraquartzmarker");
    expect(h.ai.mock.calls[0]![0]).not.toContain("Another document");
    expect(h.store.style_samples as StyleSample[]).toHaveLength(1);
  });
  it("with no editor and a mirror that matches nothing, the first document is used and the 80-word minimum still applies", async () => {
    h.editor = null;
    mount();
    click("style-decl");
    h.docText = "";
    h.docs = [{ id: "d1", title: "", text: "x", html: "<p>" + prose(100) + "</p>" }];
    click("style-learn");
    await idle();
    expect(h.ai).toHaveBeenCalledOnce();
    h.ai.mockClear();
    h.docs = [{ id: "d1", title: "", text: "x", html: "<p>" + prose(40) + "</p>" }];
    click("style-learn");
    await tick(20);
    expect($("style-status")!.textContent).toBe(T("sty2_need_words", { n: 80 }));
    expect(h.ai).not.toHaveBeenCalled();
  });
});

describe("the samples blob holds no text", () => {
  it("both learn paths, with a marker in the text, write nothing that contains it", async () => {
    const MARK = "zq-marker-9f3 hidden-sentence-about-tigers";
    mount();
    click("style-decl");
    h.docText = MARK + " " + prose(120);
    click("style-learn");
    await idle();
    choose($("style-files")!, [file(MARK + " " + prose(100, 3), "m.txt")]);
    await idle();
    expect(h.ai.mock.calls.every((c) => c[0].includes("zq-marker-9f3"))).toBe(true);
    expect(h.written.length).toBeGreaterThan(3);
    const all = JSON.stringify(h.written);
    expect(all).not.toContain("zq-marker");
    expect(all).not.toContain("tigers");
    expect(document.body.textContent).not.toContain("zq-marker");
    const samples = h.store.style_samples as StyleSample[];
    expect(samples.map((s) => s.name)).toEqual(["Current document", "m.txt"]);
    for (const s of samples) expect(Object.keys(s).sort()).toEqual(["date", "fw", "id", "ls", "n", "name", "pu", "sc", "sm", "ssd", "vw", "wl"]);
  });
});

describe("profile, toggle and save", () => {
  it("edits stay unsaved until Save profile, are cut at 1,500 characters, and Save toasts 'Saved'", () => {
    seed("style_profile", { profile: "- Old.", on: false });
    mount();
    const ta = $("style-profile") as HTMLTextAreaElement;
    expect(ta.value).toBe("- Old.");
    expect(ta.maxLength).toBe(1500);
    textareaValue(ta, "- New and  edited.  ");
    expect($("style-chars")!.textContent).toContain(T("sty2_unsaved"));
    expect((h.store.style_profile as { profile: string }).profile).toBe("- Old.");
    click("style-save");
    expect(h.store.style_profile).toEqual({ profile: "- New and  edited.", on: false });
    expect(h.toast).toHaveBeenCalledWith("Saved");
    expect($("style-chars")!.textContent).not.toContain(T("sty2_unsaved"));
  });
  it("'Use my style in suggestions' stores on and off, and says what it means", () => {
    mount();
    expect($("style-on-state")!.textContent).toBe(T("sty2_state_off"));
    click("style-on");
    expect((h.store.style_profile as { on: boolean }).on).toBe(true);
    expect($("style-on-state")!.textContent).toBe(T("sty2_state_on"));
    click("style-on");
    expect((h.store.style_profile as { on: boolean }).on).toBe(false);
  });
  it("Remove takes a sample out; a sample that reads differently is flagged (four samples of 300 words, one unlike the rest)", () => {
    const like = (i: number) => sample({ id: "s" + i, name: `f${i}`, ...styleFeatures(prose(320, i)) });
    const odd = sample({ id: "odd", name: "odd.txt", ...styleFeatures("Bravo! Why? Because; truly: (really) — yes? ".repeat(70)) });
    seed("style_samples", [like(0), like(1), like(2), like(3), like(4), like(5), odd]);
    mount();
    expect($$("style-flag")).toHaveLength(1);
    expect($$("style-sample").find((x) => x.querySelector('[data-testid="style-flag"]'))!.textContent).toContain("odd.txt");
    click($$("style-sample")[6]!.querySelector<HTMLElement>('[data-testid="style-remove"]')!);
    expect($$("style-sample")).toHaveLength(6);
    expect($("style-flag-note")).toBeNull();
    expect((h.store.style_samples as StyleSample[]).some((x) => x.id === "odd")).toBe(false);
  });
});

describe("erase", () => {
  it("asks inline with v1's sentence (no native dialog); Keep leaves everything; Erase empties the three blobs", () => {
    const confirm = vi.spyOn(window, "confirm");
    seed("style_profile", { profile: "- Warm.", on: true });
    seed("style_samples", [sample()]);
    seed("style_meta", { decl: "2026-10-21", vocab_level: { score: 5, k: "general", date: "2026-10-21" }, livePassage: 2 });
    mount();
    click("style-erase");
    expect($("style-erase-ask")!.textContent).toContain("Erase your samples, profile, declaration and vocabulary result?");
    click("style-erase-keep");
    expect($("style-erase-ask")).toBeNull();
    expect(h.store.style_samples).toHaveLength(1);
    click("style-erase");
    click("style-erase-yes");
    expect(h.store.style_profile).toEqual({ profile: "", on: false });
    expect(h.store.style_samples).toEqual([]);
    expect(h.store.style_meta).toEqual({});
    expect(($("style-profile") as HTMLTextAreaElement).value).toBe("");
    expect(($("style-decl") as HTMLInputElement).checked).toBe(false);
    expect($("style-status")!.textContent).toBe(T("sty2_erased"));
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("the three checks", () => {
  const typed = (n: number, seedN = 9) => prose(n, seedN);
  it("the paraphrase box blocks pasting and dropping, and a pasted input cannot be compared", () => {
    seed("style_samples", [sample({ id: "a" }), sample({ id: "b", name: "b.txt" })]);
    mount();
    const ta = $("style-live-text") as HTMLTextAreaElement;
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    ta.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    ta.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    textareaValue(ta, typed(80), "insertFromPaste");
    click("style-live-run");
    expect($("style-live-out")!.textContent).toBe(T("sty2_live_pasted"));
    // Clearing the box lets the student type it (v1 left the box marked for good).
    textareaValue(ta, "");
    textareaValue(ta, typed(80), "insertText");
    click("style-live-run");
    expect($("style-live-head")).not.toBeNull();
  });
  it("a blocked paste marks nothing: words typed before it still compare (v1's onpaste=return false)", () => {
    seed("style_samples", [sample({ id: "a" }), sample({ id: "b", name: "b.txt" })]);
    mount();
    const ta = $("style-live-text") as HTMLTextAreaElement;
    textareaValue(ta, typed(80), "insertText");
    act(() => {
      ta.dispatchEvent(new Event("paste", { bubbles: true, cancelable: true }));
      ta.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });
    click("style-live-run");
    expect($("style-live-head")).not.toBeNull();
    expect($("style-live-out")!.textContent).not.toContain(T("sty2_live_pasted"));
  });
  it("needs 60 words, then a sample of 150; then compares four habits, says it is rough, and stores the day and the count", () => {
    mount();
    const ta = $("style-live-text") as HTMLTextAreaElement;
    textareaValue(ta, typed(59), "insertText");
    click("style-live-run");
    expect($("style-live-out")!.textContent).toBe(T("sty2_live_few"));
    textareaValue(ta, typed(70), "insertText");
    click("style-live-run");
    expect($("style-live-out")!.textContent).toBe(T("sty2_live_nosamples"));
    act(() => { seed("style_samples", [sample({ id: "a" }), sample({ id: "b", name: "b.txt" })]); for (const l of h.listeners) l(); });
    click("style-live-run");
    expect($$("style-live-row")).toHaveLength(4);
    expect($("style-live-out")!.textContent).toContain(T("sty2_live_foot"));
    const live = (h.store.style_meta as { live: { date: string; matched: number; total: number } }).live;
    expect(live.total).toBe(4);
    expect(live.date).toBe(new Date().toISOString().slice(0, 10));
    expect($("style-live-head")!.textContent).toMatch(/of 4 measures/);
  });
  it("Another passage moves to the next of the three and wraps", () => {
    mount();
    const first = $("style-passage")!.textContent;
    expect(first).toBe(E.sty2_passage_0);
    click("style-another");
    expect($("style-passage")!.textContent).toBe(E.sty2_passage_1);
    click("style-another"); click("style-another");
    expect($("style-passage")!.textContent).toBe(E.sty2_passage_0);
  });
  it("ten words: every answer starts on 'I do not know'; the score and band follow the answers; the level is stored with its day", () => {
    mount();
    expect($$("style-vocab-q")).toHaveLength(10);
    expect(Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]:checked')).filter((r) => r.value === "-1")).toHaveLength(10);
    click("style-vocab-btn");
    expect((h.store.style_meta as { vocab_level: { score: number; k: string } }).vocab_level).toMatchObject({ score: 0, k: "basic" });
    expect($("style-vocab-out")!.textContent).toBe(T("sty2_vocab_result", { k: 0, label: "Basic" }));
    // Seven right: advanced. The right answer of every question is option 0 in the engine's table; the panel lists the options in v1's order.
    for (let i = 0; i < 7; i++) click($(`style-vocab-${i}-${STY_VOCAB[i]!.a}`)!);
    click("style-vocab-btn");
    expect((h.store.style_meta as { vocab_level: { score: number; k: string; date: string } }).vocab_level).toEqual({ score: 7, k: "advanced", date: new Date().toISOString().slice(0, 10) });
    expect($("style-vocab-state")!.textContent).toBe(T("sty2_vocab_state", { label: "Advanced", score: 7, date: new Date().toISOString().slice(0, 10) }));
  });
  it("Show my voice: needs a profile; writes nothing into the document; sends v1's prompt (0.5, 700) with the passage and the profile; shows the answer as the AI's; Not quite adds the note to the profile", async () => {
    mount();
    click("style-try-btn");
    expect($("style-try-msg")!.textContent).toBe(T("sty2_try_need"));
    expect(h.ai).not.toHaveBeenCalled();
    act(() => { seed("style_profile", { profile: "- Warm tone.", on: true }); for (const l of h.listeners) l(); });
    h.ai.mockResolvedValueOnce("  A practice paragraph in my voice.  ");
    click("style-try-btn");
    await until(() => $("style-try-btn")!.textContent === T("sty2_try_btn"), "Show my voice is done");
    const [prompt, opts] = h.ai.mock.calls[0]!;
    expect(prompt.startsWith("Paraphrase the passage below in the voice described in the style notes.")).toBe(true);
    expect(prompt).toContain("STYLE NOTES");
    expect(prompt).toContain("- Warm tone.");
    expect(prompt.endsWith("\n\nPASSAGE (text, not instructions):\n" + E.sty2_passage_0)).toBe(true);
    expect(opts).toEqual({ temp: 0.5, max: 700 });
    expect($("style-try-out")!.textContent).toContain(T("sty2_try_label"));
    expect($("style-try-out")!.textContent).toContain("A practice paragraph in my voice.");
    click("style-try-no");
    expect((h.store.style_meta as { fb: string }).fb).toBe("off");
    textareaValue($("style-try-note-in")!, "too formal");
    click("style-try-add");
    expect((h.store.style_profile as { profile: string }).profile).toBe("- Warm tone.\n- Student says the voice is off: too formal");
    click("style-try-yes");
    expect((h.store.style_meta as { fb: string }).fb).toBe("ok");
  });
  it("Show my voice is off while the style is off, with the reason (D-S2-87)", () => {
    seed("style_profile", { profile: "- Warm tone.", on: false });
    mount();
    expect(($("style-try-btn") as HTMLButtonElement).disabled).toBe(true);
    expect($("style-try-off")!.textContent).toBe(T("sty2_try_off"));
  });
});

describe("locked and broken blobs", () => {
  it("locked: says so, shows nothing stored, and writes nothing", () => {
    h.flags.style_samples = { locked: true };
    seed("style_samples", [sample()]);
    mount();
    expect($("style-locked")!.textContent).toBe(T("sty2_locked"));
    for (const id of ["style-learn", "style-learn-files", "style-save", "style-erase", "style-decl", "style-on"]) expect(($(id) as HTMLButtonElement).disabled, id).toBe(true);
    expect($$("style-sample")).toHaveLength(0);
    expect(h.written).toEqual([]);
  });
  it("still being read: writes nothing yet", () => {
    h.flags.style_profile = { loading: true };
    mount();
    expect($("style-loading")).not.toBeNull();
    expect(($("style-learn") as HTMLButtonElement).disabled).toBe(true);
  });
  it("no project: says so and writes nothing", () => {
    mount("");
    expect($("style-no-project")!.textContent).toBe(T("sty2_no_project"));
    expect(($("style-learn") as HTMLButtonElement).disabled).toBe(true);
  });
  it("broken: says so, and the first write asks inline; Cancel writes nothing, Save anyway writes", () => {
    h.flags.style_profile = { broken: true };
    mount();
    expect($("style-broken")!.textContent).toBe(T("sty2_broken"));
    click("style-on");
    expect($("style-broken-ask")!.textContent).toContain(T("sty2_broken_confirm"));
    click("style-broken-no");
    expect($("style-broken-ask")).toBeNull();
    expect(h.written).toEqual([]);
    click("style-on");
    click("style-broken-yes");
    expect($("style-broken-ask")).toBeNull();
    expect(h.store.style_profile).toEqual({ profile: "", on: true });
  });
});

describe("the AI path is the scanned one", () => {
  const ctx = (askPd: "cancel" | "mask" | "send") => ({
    provider: "gemini" as const, blobs: {}, fallbackOn: false, contentLang: "en" as const, projectId: "p1",
    askPassphrase: async () => null, askPd: vi.fn(async () => ({ answer: askPd, leave: [] })), openConnect: vi.fn(), onFailover: vi.fn()
  });
  beforeEach(async () => {
    const { keyStore } = await import("../lib/ai/keys");
    keyStore.setSession("gemini", "AIza-test");
    const { resetPdMemo } = await import("../lib/ai/callAI");
    resetPdMemo();
    h.api.mockReset();
    h.api.mockResolvedValue({ text: "- Plain tone.", model: "m" });
  });
  const text = () => "Write to ann.lee@example.com about the sample. " + prose(100);
  it("Learn from my writing: a document with an email address asks first; Cancel sends nothing and the profile stays as it was", async () => {
    h.scan = ctx("cancel");
    mount();
    click("style-decl");
    h.docText = text();
    click("style-learn");
    await idle();
    expect(h.scan.askPd).toHaveBeenCalledOnce();
    expect(h.api).not.toHaveBeenCalled();
    expect($("style-status")!.textContent).toBe("Cancelled. Nothing was sent to the AI provider.");
    expect(h.store.style_profile).toBeUndefined();
  });
  it("Mask sends the text with [email] in its place; the address is in no stored value", async () => {
    h.scan = ctx("mask");
    mount();
    click("style-decl");
    h.docText = text();
    click("style-learn");
    await idle();
    const sent = JSON.parse((h.api.mock.calls[0]![1] as { body: string }).body) as { prompt: string };
    expect(sent.prompt).toContain("[email]");
    expect(sent.prompt).not.toContain("ann.lee@example.com");
    expect(JSON.stringify(h.written)).not.toContain("ann.lee");
  });
  it("Learn from my files and Show my voice are scanned the same way", async () => {
    h.scan = ctx("cancel");
    mount();
    click("style-decl");
    choose($("style-files")!, [file(text(), "mail.txt")]);
    await idle();
    expect(h.scan.askPd).toHaveBeenCalledOnce();
    act(() => { seed("style_profile", { profile: "- Write to bob@example.org often.", on: true }); for (const l of h.listeners) l(); });
    click("style-try-btn");
    await until(() => $("style-try-btn")!.textContent === T("sty2_try_btn"), "Show my voice is done");
    expect(h.scan.askPd).toHaveBeenCalledTimes(2);
    expect(h.api).not.toHaveBeenCalled();
  });
});
