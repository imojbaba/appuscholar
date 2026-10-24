// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { BANK_MAX, bankCsv, docInnerText, gramChunks, provHash, type BankEntry } from "@appuscholar/core";
import { editorExtensions } from "../lib/editorExtensions";
import en from "../messages/en.json";
import wordsEn from "../messages/tools/words.en.json";

const h = vi.hoisted(() => ({
  store: {} as Record<string, unknown>,
  flags: {} as Record<string, { loading?: boolean; locked?: boolean; broken?: boolean }>,
  listeners: new Set<() => void>(),
  /** Every value ever handed to a blob's set(), after the update was applied: what would have gone to the server. */
  written: [] as Array<{ kind: string; value: unknown }>,
  editor: null as null | import("@tiptap/core").Editor,
  scan: null as null | import("../lib/ai/callAI").CallCtx,
  api: vi.fn(),
  ai: vi.fn(async (_prompt: string, _o: { temp: number; max: number; noLang?: boolean }) => '{"edits":[]}'),
  fetch: vi.fn(),
  download: vi.fn(),
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
  return { useCallAI: () => (prompt: string, o: { temp: number; max: number; noLang?: boolean }) => (h.scan ? real.callAI(prompt, o, h.scan) : h.ai(prompt, o)) };
});
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: (...a: unknown[]) => h.api(...a) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: { field: "education" } }) }));
// The document is a real editor (with its history), read and written through docAccess's own functions: the selection as the tools read it, and replaceFirstIn.
vi.mock("@/lib/editor/docAccess", async (orig) => {
  const real = await orig<typeof import("../lib/editor/docAccess")>();
  const ins = await import("../lib/editor/insert");
  return {
    ...real,
    useDocAccess: () => ({
      text: () => (h.editor ? docInnerText(h.editor.getHTML()) : ""),
      selection: () => (h.editor ? ins.selectionText(h.editor) : ""),
      replaceInDocument: async (o: string, r: string, opts?: { ai?: boolean }) => (h.editor ? real.replaceFirstIn(h.editor, o, r, opts) : false)
    })
  };
});
vi.mock("@/lib/export/download", () => ({ downloadBlob: h.download, safeFileName: (s: string) => s }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { Panel } from "../components/tools/words/Panel";
import { resetDictCache } from "../lib/tools/words/dict";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = { ...(en as Record<string, string>), ...(wordsEn as Record<string, string>) };
const T = (k: string, vars?: Record<string, string | number>) => (E[k] ?? k).replace(/\{(\w+)\}/g, (m, v: string) => (vars && v in vars ? String(vars[v]) : m));
const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const $$ = (id: string) => Array.from(document.body.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
const tick = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
async function until(pred: () => boolean, what = "condition") {
  for (let i = 0; i < 1000; i++) { if (pred()) return; await tick(5); }
  throw new Error("not reached: " + what);
}
const click = (id: string | HTMLElement) => act(() => { (typeof id === "string" ? $(id)! : id).click(); });
const typeIn = (el: HTMLElement, value: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
const choose = (el: HTMLElement, value: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
const enter = (el: HTMLElement) => act(() => { el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });

function mount(projectId = "p1"): Root {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const r = createRoot(el);
  roots.push(r);
  act(() => r.render(<Panel tab="words" projectId={projectId} />));
  return r;
}
/** The open document: a real editor with its history, holding `html`. */
function setDoc(html: string): Editor {
  h.editor?.destroy();
  h.editor = new Editor({ extensions: editorExtensions, content: html });
  return h.editor;
}
const docText = () => docInnerText(h.editor!.getHTML());
/** Selects the first occurrence of `s` in the editor's text (single text node paragraphs). */
function select(s: string) {
  const ed = h.editor!;
  let from = -1;
  ed.state.doc.descendants((n, pos) => { if (from < 0 && n.isText) { const i = (n.text ?? "").indexOf(s); if (i >= 0) from = pos + i; } return true; });
  if (from < 0) throw new Error("not in the document: " + s);
  act(() => { ed.commands.setTextSelection({ from, to: from + s.length }); });
}

/** What dictionaryapi.dev answers for a word. */
const entry = (word: string) => [{
  word, phonetic: "/ˈstʌdi/",
  meanings: [
    { partOfSpeech: "noun", definitions: [{ definition: "The pursuit of knowledge.", example: "She gave her study to rocks.", synonyms: ["research"] }, { definition: "A room for work." }, { definition: "A third meaning that is left out." }], synonyms: ["learning", "two words"] },
    { partOfSpeech: "verb", definitions: [{ definition: "To learn about a subject." }] }
  ]
}];
const reply = (status: number, body: unknown = null) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const found = (w: string) => { h.fetch.mockResolvedValueOnce(reply(200, entry(w))); };
async function lookup(w: string) {
  typeIn($("dict-in")!, w);
  click("dict-go");
  await until(() => !!$("dict-out")!.textContent && !($("dict-out")!.textContent ?? "").startsWith("Looking up"), "the lookup is done");
}
const bankOf = () => h.store.words_bank as BankEntry[] | undefined;
const prefsOf = () => h.store.words_prefs as { spell?: string; gram_stats?: Record<string, number> } | undefined;
const seed = (kind: string, value: unknown) => { h.store[kind] = value; };
const entryRow = (w: string, over: Partial<BankEntry> = {}): BankEntry => ({ w, pos: "noun", m: "A meaning.", h: "", d: "2026-10-01", ...over });

beforeEach(() => {
  h.store = {}; h.flags = {}; h.written = []; h.scan = null; h.editor = null;
  h.ai.mockClear(); h.ai.mockImplementation(async () => '{"edits":[]}');
  h.fetch.mockReset(); h.download.mockClear(); h.toast.mockClear(); h.api.mockReset();
  vi.stubGlobal("fetch", h.fetch);
  resetDictCache();
  setDoc("<p></p>");
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; h.editor?.destroy(); h.editor = null; vi.unstubAllGlobals(); h.scan = null; });

describe("Dictionary: look up", () => {
  it("looks a word up at dictionaryapi.dev and shows the phonetic, two definitions of each of up to four parts of speech, the example, similar words and the footer", async () => {
    mount();
    found("study");
    await lookup("study");
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(h.fetch.mock.calls[0]![0]).toBe("https://api.dictionaryapi.dev/api/v2/entries/en/study");
    const out = $("dict-out")!.textContent!;
    expect(out).toContain("study");
    expect(out).toContain("/ˈstʌdi/");
    expect(out).toContain("noun");
    expect(out).toContain("1. The pursuit of knowledge.");
    expect(out).toContain(T("wd2_example") + " She gave her study to rocks.");
    expect(out).toContain("2. A room for work.");
    expect(out).not.toContain("left out");
    expect(out).toContain("verb");
    expect($$("dict-similar").map((b) => b.textContent)).toEqual(["learning", "research"]);
    expect($("dict-footer")!.textContent).toBe(T("wd2_dict_footer"));
  });
  it("normalises what was typed (one lower-case word of letters, 40 at most), looks up on Enter, and asks for a word first when there is none", async () => {
    mount();
    expect(($("dict-in") as HTMLInputElement).maxLength).toBe(40);
    click("dict-go");
    expect($("dict-status")!.textContent).toBe(T("wd2_type_first"));
    expect(h.fetch).not.toHaveBeenCalled();
    found("study");
    typeIn($("dict-in")!, "  Study! ");
    enter($("dict-in")!);
    await until(() => h.fetch.mock.calls.length === 1, "fetch");
    expect(h.fetch.mock.calls[0]![0]).toBe("https://api.dictionaryapi.dev/api/v2/entries/en/study");
    expect(($("dict-in") as HTMLInputElement).value).toBe("study");
  });
  it("a word with no entry says so in v1's words and is not cached; the service failing and no internet each say their own sentence", async () => {
    mount();
    h.fetch.mockResolvedValueOnce(reply(404));
    await lookup("studdy");
    expect($("dict-out")!.textContent).toBe(T("wd2_notfound", { w: "studdy" }));
    expect($("dict-save")).toBeNull();
    h.fetch.mockResolvedValueOnce(reply(503));
    await lookup("studdy");
    expect($("dict-out")!.textContent).toBe(T("wd2_service", { status: 503 }));
    h.fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await lookup("studdy");
    expect($("dict-out")!.textContent).toBe(T("wd2_offline"));
    // not cached: asked again each time
    expect(h.fetch).toHaveBeenCalledTimes(3);
  });
  it("a word looked up before is answered from the memory cache with no request, and the cache is never written to a blob", async () => {
    mount();
    found("study");
    await lookup("study");
    await lookup("study");
    expect(h.fetch).toHaveBeenCalledOnce();
    expect($("dict-out")!.textContent).toContain("1. The pursuit of knowledge.");
    expect(h.written).toEqual([]);
  });
  it("Use my selected word looks up the first word of the selection; with nothing selected it asks for a selection and never takes the whole document", async () => {
    mount();
    setDoc("<p>Memory loss in older adults is common.</p>");
    click("dict-selected");
    expect($("dict-status")!.textContent).toBe(T("wd2_select_first"));
    expect(h.fetch).not.toHaveBeenCalled();
    select("loss in");
    found("loss");
    click("dict-selected");
    await until(() => h.fetch.mock.calls.length === 1, "fetch");
    expect(h.fetch.mock.calls[0]![0]).toBe("https://api.dictionaryapi.dev/api/v2/entries/en/loss");
  });
  it("a similar word is a button that looks that word up", async () => {
    mount();
    found("study");
    await lookup("study");
    h.fetch.mockResolvedValueOnce(reply(200, entry("learning")));
    click($$("dict-similar")[0]!);
    await until(() => h.fetch.mock.calls.length === 2, "second fetch");
    expect(h.fetch.mock.calls[1]![0]).toBe("https://api.dictionaryapi.dev/api/v2/entries/en/learning");
  });
});

describe("Dictionary: Hindi meaning (AI)", () => {
  it("asks with v1's prompt and options, shows the answer in a label that says the AI wrote it, and keeps the Hindi for the word bank", async () => {
    mount();
    found("study");
    await lookup("study");
    h.ai.mockResolvedValueOnce('{"simple":"Learning about a subject","hindi":"अध्ययन","example":"The study took a year."}');
    click("dict-ai-btn");
    await until(() => !!$("dict-ai-out"), "the AI answer");
    expect(h.ai).toHaveBeenCalledOnce();
    const [prompt, o] = h.ai.mock.calls[0]!;
    expect(prompt.startsWith("You are a bilingual English and Hindi dictionary helper for students of education.")).toBe(true);
    expect(prompt.endsWith("<<<\nstudy\n>>>")).toBe(true);
    expect(o).toEqual({ temp: 0.2, max: 600, noLang: true });
    const a = $("dict-ai-out")!;
    expect(a.textContent).toContain("Learning about a subject");
    // AI output carries the gold edge (Global Constraints), as the grammar AI cards do.
    expect(a.style.borderColor).toBe("var(--gold)");
    expect(a.textContent).toContain("अध्ययन");
    expect(a.textContent).toContain("The study took a year.");
    expect($("dict-ai-label")!.textContent).toBe(T("wd2_ai_label"));
    click("dict-save");
    expect(bankOf()![0]!.h).toBe("अध्ययन");
  });
  it("an example that does not hold the word is dropped, and an AI that is unsure says so and shows nothing of its own", async () => {
    mount();
    found("study");
    await lookup("study");
    h.ai.mockResolvedValueOnce('{"simple":"Learning","hindi":"unsure","example":"Something else entirely."}');
    click("dict-ai-btn");
    await until(() => !!$("dict-ai-out"), "answer");
    expect($("dict-ai-out")!.textContent).not.toContain("Something else entirely.");
    expect($("dict-ai-out")!.textContent).not.toContain("unsure");
    found("memory");
    await lookup("memory");
    h.ai.mockResolvedValueOnce('{"simple":"unsure","hindi":"unsure","example":"unsure"}');
    click("dict-ai-btn");
    await until(() => !!$("dict-ai-unsure"), "unsure");
    expect($("dict-ai-unsure")!.textContent).toBe(T("wd2_ai_unsure"));
    expect($("dict-ai-out")).toBeNull();
  });
  it("an AI that fails shows the sentence callAI gave, and the button is there to try again", async () => {
    mount();
    found("study");
    await lookup("study");
    h.ai.mockRejectedValueOnce(new Error("Could not reach the AI provider."));
    click("dict-ai-btn");
    await until(() => !!$("dict-ai-error"), "error");
    expect($("dict-ai-error")!.textContent).toBe("Could not reach the AI provider.");
    expect($("dict-ai-btn")).not.toBeNull();
  });
});

describe("Word bank", () => {
  it("Save to my word bank keeps word, part of speech, the first meaning cut to 160, the Hindi and the day; toasts Saved; a second save says it is there already", async () => {
    mount();
    found("study");
    await lookup("study");
    click("dict-save");
    expect(bankOf()).toEqual([{ w: "study", pos: "noun", m: "The pursuit of knowledge.", h: "", d: new Date().toISOString().slice(0, 10) }]);
    expect(h.toast).toHaveBeenCalledWith(T("wd2_saved"));
    expect($$("bank-item").length).toBe(1);
    click("dict-save");
    expect(bankOf()!.length).toBe(1);
    expect($("dict-status")!.textContent).toBe(T("wd2_already", { w: "study" }));
    expect(h.toast).toHaveBeenCalledTimes(1);
  });
  it("keeps 500 at most, newest first: the 501st word puts the oldest out, and says so", async () => {
    const old = Array.from({ length: BANK_MAX }, (_, i) => entryRow("w" + i));
    seed("words_bank", old);
    mount();
    found("study");
    await lookup("study");
    click("dict-save");
    const b = bankOf()!;
    expect(b.length).toBe(BANK_MAX);
    expect(b[0]!.w).toBe("study");
    expect(b[BANK_MAX - 1]!.w).toBe("w498");
    expect(b.some((x) => x.w === "w499")).toBe(false);
    expect($("dict-status")!.textContent).toBe(T("wd2_bank_full"));
  });
  it("lists the words with their part of speech and Hindi (the newest 60), opens one in the dictionary, and Remove takes one out", async () => {
    seed("words_bank", [entryRow("alpha", { h: "अल्फा" }), entryRow("beta")]);
    mount();
    expect($("bank-count")!.textContent).toBe(T("wd2_bank_count_n", { n: 2 }));
    expect($$("bank-item")[0]!.textContent).toContain("alpha");
    expect($$("bank-item")[0]!.textContent).toContain("अल्फा");
    h.fetch.mockResolvedValueOnce(reply(200, entry("beta")));
    click($$("bank-open")[1]!);
    await until(() => h.fetch.mock.calls.length === 1, "fetch");
    expect(h.fetch.mock.calls[0]![0]).toBe("https://api.dictionaryapi.dev/api/v2/entries/en/beta");
    click($$("bank-remove")[0]!);
    expect(bankOf()!.map((x) => x.w)).toEqual(["beta"]);
    expect($("dict-status")!.textContent).toBe(T("wd2_removed", { w: "alpha" }));
  });
  it("shows an empty bank in v1's words and has nothing to download", () => {
    mount();
    expect($("bank-list")!.textContent).toBe(T("wd2_bank_none"));
    expect($("bank-csv")!.hasAttribute("disabled")).toBe(true);
  });
  it("Download as a spreadsheet saves word-bank.csv as text/csv;charset=utf-8, a byte-order mark first, then the five columns", async () => {
    const bank = [entryRow("alpha", { h: "अल्फा", m: "A first, \"quoted\" letter." }), entryRow("beta")];
    seed("words_bank", bank);
    mount();
    click("bank-csv");
    expect(h.download).toHaveBeenCalledOnce();
    const [name, blob] = h.download.mock.calls[0] as [string, Blob];
    expect(name).toBe("word-bank.csv");
    expect(blob.type).toBe("text/csv;charset=utf-8");
    const bytes = new Uint8Array(await new Promise<ArrayBuffer>((res) => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.readAsArrayBuffer(blob); }));
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe(bankCsv(bank));
    expect(new TextDecoder().decode(bytes.slice(3)).split("\n")[0]).toBe("word,part of speech,meaning,hindi,date saved");
  });
});

describe("Grammar: check with rules", () => {
  it("shows each finding as a card: kind, rule, the original struck through, the fix, why, before and after; short text asks for some text first", () => {
    mount();
    click("gram-rules");
    expect($("gram-status")!.textContent).toBe(T("wd2_write_first"));
    setDoc("<p>The informations were useful to everyone here.</p>");
    click("gram-rules");
    const cards = $$("gram-card");
    expect(cards.length).toBe(1);
    const c = cards[0]!;
    expect(c.textContent).toContain(T("wd2_kind_error"));
    expect(c.textContent).toContain("Some nouns have no plural");
    expect(c.querySelector("s, del, .line-through")!.textContent).toBe("informations");
    expect(c.textContent).toContain("→");
    expect(c.textContent).toContain("information");
    expect(c.textContent).toContain(T("wd2_before_after", { a: "The informations were useful.", b: "The information was useful." }));
    expect(c.querySelector('[data-testid="gram-apply"]')).not.toBeNull();
  });
  it("a finding with no automatic fix (Indian English) has Ignore but no Apply; Ignore removes the card", () => {
    setDoc("<p>Please do the needful before the report is due.</p>");
    mount();
    click("gram-rules");
    const c = $$("gram-card")[0]!;
    expect(c.textContent).toContain(T("wd2_kind_regional"));
    expect(c.querySelector('[data-testid="gram-apply"]')).toBeNull();
    click(c.querySelector<HTMLElement>('[data-testid="gram-ignore"]')!);
    expect($$("gram-card").length).toBe(0);
    expect($("gram-empty")!.textContent).toBe(T("wd2_nothing_rules"));
  });
  it("checks the selection when there is one, else the whole document", () => {
    setDoc("<p>The informations were useful here. She returned back to the lab today.</p>");
    mount();
    select("She returned back to the lab");
    click("gram-rules");
    expect($$("gram-card").length).toBe(1);
    expect($$("gram-card")[0]!.textContent).toContain("returned back");
    act(() => { h.editor!.commands.setTextSelection(1); });
    click("gram-rules");
    expect($$("gram-card").length).toBe(2);
  });
  it("counts the rules that found something in the project, and shows the three most frequent", () => {
    setDoc("<p>The informations were useful and the equipments broke. She returned back to the lab today.</p>");
    mount();
    click("gram-rules");
    expect(prefsOf()!.gram_stats).toEqual({ uncountable: 2, "return-back": 1 });
    click("gram-rules");
    expect(prefsOf()!.gram_stats).toEqual({ uncountable: 4, "return-back": 2 });
    expect($("gram-top")!.textContent).toBe(T("wd2_top", { list: "Some nouns have no plural (4), “Return” already means “come back” (2)" }));
  });
  it("the spelling standard defaults to British, is kept in the project, and decides what the rules flag", () => {
    setDoc("<p>The colour of the organization was grey in the report.</p>");
    mount();
    expect(($("gram-spell") as HTMLSelectElement).value).toBe("uk");
    click("gram-rules");
    expect($$("gram-card").map((c) => c.textContent).join("|")).toContain("organization");
    expect($$("gram-card").map((c) => c.textContent).join("|")).not.toContain("colour");
    choose($("gram-spell")!, "us");
    expect(prefsOf()!.spell).toBe("us");
    click("gram-rules");
    const all = $$("gram-card").map((c) => c.textContent).join("|");
    expect(all).toContain("colour");
    choose($("gram-spell")!, "off");
    expect(prefsOf()!.spell).toBe("off");
    click("gram-rules");
    expect($$("gram-card").length).toBe(0);
  });
  it("starts from the stored spelling standard", () => {
    seed("words_prefs", { spell: "us" });
    mount();
    expect(($("gram-spell") as HTMLSelectElement).value).toBe("us");
  });
});

describe("Grammar: Apply", () => {
  it("Apply changes only the verified original and Ctrl+Z undoes it", async () => {
    const ed = setDoc("<p>The informations were useful. Later the informations were checked again.</p>");
    const before = ed.getHTML();
    mount();
    click("gram-rules");
    expect($$("gram-card").length).toBe(2);
    click($$("gram-card")[0]!.querySelector<HTMLElement>('[data-testid="gram-apply"]')!);
    await until(() => $("gram-status")!.textContent === T("wd2_applied"), "applied");
    // only the first occurrence of the original: the second sentence and everything else is as it was
    expect(docText()).toBe("The information were useful. Later the informations were checked again.");
    expect($$("gram-card").length).toBe(1);
    // A rule's fix is the student's own edit: no AI mark.
    expect(ed.getHTML()).not.toContain("ai-ins");
    // through the editor's own history
    act(() => { ed.commands.undo(); });
    expect(ed.getHTML()).toBe(before);
    expect(docText()).toBe("The informations were useful. Later the informations were checked again.");
  });
  it("when the original is no longer in the text it changes nothing, says so in v1's words and keeps the card", async () => {
    const ed = setDoc("<p>The informations were useful to everyone here.</p>");
    mount();
    click("gram-rules");
    act(() => { ed.commands.setContent("<p>The notes were useful to everyone here.</p>"); });
    const before = ed.getHTML();
    click($$("gram-card")[0]!.querySelector<HTMLElement>('[data-testid="gram-apply"]')!);
    await until(() => $("gram-status")!.textContent === T("wd2_apply_gone"), "the not-found message");
    expect(ed.getHTML()).toBe(before);
    expect($$("gram-card").length).toBe(1);
  });
  it("applies across inline formatting (the original spans a bold run), and the toast is not used for it", async () => {
    const ed = setDoc("<p>She returned <strong>back</strong> to the lab on Friday.</p>");
    mount();
    click("gram-rules");
    click($$("gram-card")[0]!.querySelector<HTMLElement>('[data-testid="gram-apply"]')!);
    await until(() => $("gram-status")!.textContent === T("wd2_applied"), "applied");
    expect(docText()).toBe("She returned to the lab on Friday.");
    expect(h.toast).not.toHaveBeenCalled();
    act(() => { ed.commands.undo(); });
    expect(docText()).toBe("She returned back to the lab on Friday.");
  });
});

describe("Grammar: check with AI", () => {
  const para = "The informations were useful to everyone. We discussed about the plan in the long meeting that followed.";
  it("sends each part of the first 9,000 characters with v1's prompt and options, and shows only the edits whose words are in the text, with the counts", async () => {
    setDoc("<p>" + para + "</p>");
    mount();
    h.ai.mockResolvedValueOnce(JSON.stringify({ edits: [
      { original: "in the long meeting", fix: "during the long meeting", rule: "Preposition", why: "Reads better.", kind: "style" },
      { original: "words that are nowhere in the text", fix: "words fixed", rule: "x", why: "y", kind: "error" }
    ] }));
    click("gram-ai");
    await until(() => !!$("gram-ai-line"), "the AI result");
    expect(h.ai).toHaveBeenCalledOnce();
    const [prompt, o] = h.ai.mock.calls[0]!;
    expect(prompt.startsWith("You are a careful English grammar and usage checker for a student of education.")).toBe(true);
    expect(prompt).toContain("Follow British spelling.");
    expect(prompt.endsWith("TEXT START\n" + gramChunks(para)[0] + "\nTEXT END")).toBe(true);
    expect(o).toEqual({ temp: 0.1, max: 1800, noLang: true });
    expect($("gram-ai-line")!.textContent).toBe(T("wd2_ai_sum_one", { checked: 1 }) + T("wd2_ai_drop_one") + T("wd2_ai_tail"));
    const texts = $$("gram-card").map((c) => c.textContent ?? "");
    // the two rule findings and the one verified AI edit, in order of place
    expect(texts.length).toBe(3);
    expect(texts[2]).toContain("in the long meeting");
    expect(texts[2]).toContain("during the long meeting");
    expect(texts[2]).toContain(T("wd2_card_ai"));
    expect(texts.join("|")).not.toContain("nowhere");
  });
  it("AI edits whose original is not in the text are dropped (and a fix that changes a number is dropped too)", async () => {
    setDoc("<p>In 2019 the sample grew by 5 per cent in the first year of the study.</p>");
    mount();
    h.ai.mockResolvedValueOnce(JSON.stringify({ edits: [
      { original: "grew by 5 percent", fix: "grew by 5 per cent", rule: "r", why: "w", kind: "style" },
      { original: "grew by 5 per cent", fix: "grew by 6 per cent", rule: "r", why: "w", kind: "error" },
      { original: "in the first year", fix: "in the first years", rule: "Agreement", why: "w", kind: "error" }
    ] }));
    click("gram-ai");
    await until(() => !!$("gram-ai-line"), "the AI result");
    expect($("gram-ai-line")!.textContent).toContain(T("wd2_ai_drop_n", { n: 2 }));
    const all = $$("gram-card").map((c) => c.textContent).join("|");
    expect(all).toContain("in the first years");
    expect(all).not.toContain("6 per cent");
    expect(all).not.toContain("5 percent");
  });
  it("an AI card's fix goes in marked as AI text (rule 7; OJ, 23 Oct), through the same Apply, and Ctrl+Z undoes it", async () => {
    const ed = setDoc("<p>" + para + "</p>");
    const before = ed.getHTML();
    mount();
    h.ai.mockResolvedValueOnce(JSON.stringify({ edits: [{ original: "in the long meeting", fix: "during the long meeting", rule: "Preposition", why: "w", kind: "style" }] }));
    click("gram-ai");
    await until(() => !!$("gram-ai-line"), "result");
    const card = $$("gram-card").find((c) => c.textContent!.includes("in the long meeting"))!;
    click(card.querySelector<HTMLElement>('[data-testid="gram-apply"]')!);
    await until(() => $("gram-status")!.textContent === T("wd2_applied"), "applied");
    expect(docText()).toContain("during the long meeting that followed");
    expect(ed.getHTML()).toContain(`<span class="ai-ins" data-h="${provHash("during the long meeting")}">during the long meeting</span>`);
    act(() => { ed.commands.undo(); });
    expect(ed.getHTML()).toBe(before);
  });
  it("reads long text in parts of up to 1,800 characters, at most the first 9,000, one request each; a failure ends the loop and keeps what came back", async () => {
    const sentence = "The committee reviewed the proposal carefully and then gave its answer to the board. ";
    const long = sentence.repeat(120).trim();
    setDoc("<p>" + long + "</p>");
    mount();
    const parts = gramChunks(long);
    expect(parts.length).toBeGreaterThan(3);
    h.ai.mockResolvedValueOnce('{"edits":[]}').mockResolvedValueOnce("not json at all").mockRejectedValueOnce(new Error("The AI service is having problems."));
    click("gram-ai");
    await until(() => !!$("gram-ai-line"), "result");
    expect(h.ai).toHaveBeenCalledTimes(3);
    expect($("gram-ai-line")!.textContent).toBe(T("wd2_ai_sum_n", { checked: 2, parts: parts.length }) + T("wd2_ai_drop_one") + T("wd2_ai_tail"));
    expect($("gram-status")!.textContent).toBe("The AI service is having problems.");
  });
  it("asks for a paragraph first when there is under 30 characters, and sends nothing", () => {
    setDoc("<p>Too short here.</p>");
    mount();
    click("gram-ai");
    expect($("gram-status")!.textContent).toBe(T("wd2_write_para"));
    expect(h.ai).not.toHaveBeenCalled();
  });
  it("sends the spelling standard to the AI: American, or no comment on spelling", async () => {
    setDoc("<p>" + para + "</p>");
    seed("words_prefs", { spell: "us" });
    mount();
    click("gram-ai");
    await until(() => h.ai.mock.calls.length === 1, "a call");
    expect(h.ai.mock.calls[0]![0]).toContain("Follow American spelling.");
    await until(() => !!$("gram-ai-line"), "done");
    choose($("gram-spell")!, "off");
    click("gram-ai");
    await until(() => h.ai.mock.calls.length === 2, "a second call");
    expect(h.ai.mock.calls[1]![0]).toContain("Do not comment on British or American spelling.");
  });
});

describe("the AI path is the scanned one", () => {
  const ctx = (askPd: "cancel" | "mask" | "send") => ({
    provider: "gemini" as const, blobs: {}, fallbackOn: false, contentLang: "en" as const, projectId: "p1",
    askPassphrase: async () => null, askPd: vi.fn(async () => askPd), openSettings: vi.fn(), onFailover: vi.fn()
  });
  beforeEach(async () => {
    const { keyStore } = await import("../lib/ai/keys");
    keyStore.setSession("gemini", "AIza-test");
    const { resetPdMemo } = await import("../lib/ai/callAI");
    resetPdMemo();
    h.api.mockResolvedValue({ text: '{"edits":[]}', model: "m" });
  });
  const withEmail = "<p>Write to ann.lee@example.com about the sample. The informations were useful to everyone here.</p>";
  it("Check with AI: a text with an email address asks first; Cancel sends nothing, says so, and the rules' findings still show", async () => {
    h.scan = ctx("cancel");
    setDoc(withEmail);
    mount();
    click("gram-ai");
    await until(() => !!$("gram-ai-line"), "result");
    expect(h.scan.askPd).toHaveBeenCalledOnce();
    expect(h.api).not.toHaveBeenCalled();
    expect($("gram-status")!.textContent).toBe("Cancelled. Nothing was sent to the AI provider.");
    expect($("gram-ai-line")!.textContent).toContain(T("wd2_ai_sum_one", { checked: 0 }));
  });
  it("Mask sends the text with [email] in place of the address, and nothing else of it is changed", async () => {
    h.scan = ctx("mask");
    setDoc(withEmail);
    mount();
    click("gram-ai");
    await until(() => h.api.mock.calls.length === 1, "an api call");
    const sent = JSON.stringify(h.api.mock.calls[0]);
    expect(sent).toContain("[email]");
    expect(sent).not.toContain("ann.lee@example.com");
    await until(() => !!$("gram-ai-line"), "result");
  });
  it("Hindi meaning sends the word through the same scanned call", async () => {
    h.scan = ctx("send");
    h.api.mockResolvedValue({ text: '{"simple":"Learning","hindi":"अध्ययन","example":"The study took a year."}', model: "m" });
    mount();
    found("study");
    await lookup("study");
    click("dict-ai-btn");
    await until(() => !!$("dict-ai-out"), "answer");
    expect(h.api).toHaveBeenCalledOnce();
    expect((JSON.parse((h.api.mock.calls[0] as [string, { body: string }])[1].body) as { prompt: string }).prompt.endsWith("<<<\nstudy\n>>>")).toBe(true);
  });
});

describe("saved state of the tab", () => {
  it("without a project: lookups and the checks still work, the bank and the spelling choice are off, and nothing is written", async () => {
    mount("");
    expect($("words-no-project")!.textContent).toBe(T("wd2_no_project"));
    expect($("gram-spell")!.hasAttribute("disabled")).toBe(true);
    found("study");
    await lookup("study");
    expect($("dict-save")!.hasAttribute("disabled")).toBe(true);
    setDoc("<p>The informations were useful to everyone here.</p>");
    click("gram-rules");
    expect($$("gram-card").length).toBe(1);
    expect(h.written).toEqual([]);
  });
  it("while the blobs are read: the loading sign, and nothing is written; locked: the sentence, and the writes are off", async () => {
    h.flags.words_bank = { loading: true };
    mount();
    expect($("words-loading")).not.toBeNull();
    found("study");
    await lookup("study");
    expect($("dict-save")!.hasAttribute("disabled")).toBe(true);
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    h.flags = { words_bank: { locked: true }, words_prefs: { locked: true } };
    mount();
    expect($("words-locked")!.textContent).toBe(T("wd2_locked"));
    expect($("gram-spell")!.hasAttribute("disabled")).toBe(true);
    expect(h.written).toEqual([]);
  });
  it("a word bank that does not open: says so, and Save asks before it writes over it (Save anyway / Cancel)", async () => {
    h.flags.words_bank = { broken: true };
    mount();
    expect($("words-broken")!.textContent).toBe(T("wd2_broken"));
    found("study");
    await lookup("study");
    click("dict-save");
    expect($("words-broken-ask")!.textContent).toContain(T("wd2_broken_confirm"));
    expect(h.written).toEqual([]);
    click("words-broken-no");
    expect($("words-broken-ask")).toBeNull();
    expect(h.written).toEqual([]);
    click("dict-save");
    click("words-broken-yes");
    expect(bankOf()!.map((x) => x.w)).toEqual(["study"]);
  });
  it("the spelling choice never asks, even when its blob does not open", () => {
    h.flags.words_prefs = { broken: true };
    mount();
    choose($("gram-spell")!, "us");
    expect($("words-broken-ask")).toBeNull();
    expect(prefsOf()!.spell).toBe("us");
  });
});
