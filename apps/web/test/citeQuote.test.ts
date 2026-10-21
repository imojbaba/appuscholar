// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { classifyAiUse } from "@appuscholar/core";
import { editorExtensions } from "../lib/editorExtensions";
import { insertHtmlBlock, insertTextAtCursor } from "../lib/editor/insert";
import { AiCallError, apiMsg } from "../lib/ai/callAI";
import { citeInsertQuote, quotePrompt, QUOTE_INSERTED, QUOTE_OPTS, translatedQuoteHtml } from "../lib/cite/quote";

/*
 * "Insert quote" (v1 citInsertQuote 7888-7908). Every expected value is v1's own, from test/golden/citshare/cases.json: for each quote, the AI calls v1 made (prompt and options),
 * the block it handed insertHTMLBlockIntoEditor, the text it handed citInsertAtCursor, its toasts and what the textarea held afterwards.
 */
type Q = { id: string; quote: string; srcLang: string; contentLang: "en" | "hi"; reply?: string; error?: string };
type Out = { id: string; calls: Array<{ prompt: string; opts: Record<string, unknown> }>; block: string[]; atCursor: string[]; toasts: string[]; after: string };
const GOLDEN = join(__dirname, "../../../packages/core/test/golden/citshare");
const INPUTS = (JSON.parse(readFileSync(join(GOLDEN, "inputs.json"), "utf8")) as { quotes: Q[] }).quotes;
const OUT = (JSON.parse(readFileSync(join(GOLDEN, "cases.json"), "utf8")) as { quotes: Out[] }).quotes;

/** v1's callAI threw `new Error('key')` (apiMsg 5255); v2's callAI rejects with the AiCallError whose message is the same sentence. */
const v2Error = (code: string) => code === "key" ? new AiCallError("no-key", apiMsg("no-key")) : new Error(code);

async function run(q: Q) {
  const calls: Array<{ prompt: string; opts: Record<string, unknown> }> = [];
  const block: string[] = [], atCursor: string[] = [], toasts: string[] = [];
  let after = q.quote;
  await citeInsertQuote({
    quote: q.quote, srcLang: q.srcLang, contentLang: q.contentLang,
    callAI: async (prompt, opts) => { calls.push({ prompt, opts: { ...opts } }); if (q.error !== undefined) throw v2Error(q.error); return q.reply ?? ""; },
    insertBlock: async (html) => { block.push(html); return true; },
    insertAtCursor: async (text) => { atCursor.push(text); return true; },
    clearQuote: () => { after = ""; },
    toast: (m) => { toasts.push(m); }
  });
  return { id: q.id, calls, block, atCursor, toasts, after };
}

describe("citeInsertQuote equals v1's citInsertQuote", () => {
  it("the fixture reaches every path: empty, as-is (both languages), translated, and the error", () => {
    expect(OUT.map((o) => o.id)).toEqual(INPUTS.map((q) => q.id));
    expect(OUT.some((o) => o.calls.length === 0 && o.atCursor.length === 0)).toBe(true);
    expect(OUT.filter((o) => o.atCursor.length === 1)).toHaveLength(3);
    expect(OUT.filter((o) => o.block.length === 1)).toHaveLength(2);
    expect(OUT.some((o) => o.calls.length === 1 && o.block.length === 0)).toBe(true);
  });
  for (const q of INPUTS) {
    it(`${q.id}: the same calls, insert, toasts and textarea`, async () => {
      expect(await run(q)).toEqual(OUT.find((o) => o.id === q.id));
    });
  }
  it("the prompt is v1 7896's text with the quote between the markers, at temperature 0.2, 900 tokens and no language line", () => {
    const o = OUT.find((x) => x.id === "en-hi")!;
    expect(quotePrompt("The span of absolute judgment is limited.")).toBe(o.calls[0]!.prompt);
    expect(QUOTE_OPTS).toEqual({ temp: 0.2, max: 900, noLang: true });
    expect(o.calls[0]!.opts).toEqual(QUOTE_OPTS);
  });
  it("the AI-use log files the call as v1 does (5419): translating a quotation into Hindi", () => {
    expect(classifyAiUse(quotePrompt("x"))).toEqual({ k: "translating a quotation into Hindi", g: "text" });
  });
  it("a translation whose document then does not open inserts nothing, keeps the quote in the box and claims no success", async () => {
    const toasts: string[] = [], clear = vi.fn();
    await citeInsertQuote({
      quote: "The span of absolute judgment is limited.", srcLang: "en", contentLang: "hi", callAI: async () => "अनुवाद",
      insertBlock: async () => false, insertAtCursor: async () => true, clearQuote: clear, toast: (m) => { toasts.push(m); }
    });
    expect(toasts).toEqual(["🔎 Translating quote…"]);
    expect(clear).not.toHaveBeenCalled();
  });
  it("translatedQuoteHtml is v1's markup", () => {
    expect(translatedQuoteHtml("He said \"less <is> more\" & left.\nSecond line.", "उन्होंने कहा \"कम <ही> अधिक\" & चले गए।"))
      .toBe(OUT.find((x) => x.id === "en-hi-marks")!.block[0]);
  });
});

const editors: Editor[] = [];
const make = (content: string) => { const e = new Editor({ extensions: editorExtensions, content }); editors.push(e); return e; };
afterEach(() => { for (const e of editors.splice(0)) e.destroy(); });
const focusIn = (e: Editor) => { e.view.dom.dispatchEvent(new FocusEvent("focus")); };

describe("the quote in the editor", () => {
  it("a translated quote keeps its class and the original in its title (hover), at the cursor", () => {
    const e = make("<p>Before. After.</p>");
    focusIn(e);
    e.commands.setTextSelection(1 + "Before. ".length);
    const original = "He said \"less <is> more\" & left.";
    insertHtmlBlock(e, translatedQuoteHtml(original, "कम ही अधिक"));
    const span = new DOMParser().parseFromString(e.getHTML(), "text/html").querySelector("span.translated-quote")!;
    expect(span.getAttribute("title")).toBe(original);
    expect(span.textContent).toBe("“कम ही अधिक” (अनुवादित)");
    expect(e.getText()).toBe("Before. “कम ही अधिक” (अनुवादित)After.");
  });
  it("an as-is quote goes at the cursor as the student's own text", () => {
    const e = make("<p>Before. After.</p>");
    focusIn(e);
    e.commands.setTextSelection(1 + "Before. ".length);
    insertTextAtCursor(e, "“Memory is limited.” ");
    expect(e.getHTML()).toBe("<p>Before. “Memory is limited.” After.</p>");
  });
  it("with no cursor placed it goes at the end on a new line (insertIntoEditor's '\\n'+text, 4199), a newline in the quote a line break", () => {
    const e = make("<p>Mine.</p>");
    insertTextAtCursor(e, "“One\nTwo” ");
    expect(e.getHTML()).toBe("<p>Mine.<br>“One<br>Two” </p>");
  });
  it("QUOTE_INSERTED is v1's toast", () => { expect(QUOTE_INSERTED).toBe("Quote inserted ✓"); });
});
